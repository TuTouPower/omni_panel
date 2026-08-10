// 回放录的 local-api 响应。导出 create_mock_handler 供 vite plugin / 独立 server 复用。
// 独立运行：node tests/e2e/fixtures/mock_server.mjs（监听 17864，需先 pnpm e2e:gen-data）
import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const RESP_FILE =
    process.env["MOCK_FIXTURE"] === "synthetic"
        ? resolve(ROOT, "tests/e2e/fixtures/synthetic.json")
        : resolve(ROOT, "tests/e2e/fixtures/data/responses.json");
const PORT = Number(process.env["MOCK_PORT"] || 17864);

export function create_mock_handler(responses) {
    function find_by(prefix) {
        const key = Object.keys(responses).find((k) => k.startsWith(prefix));
        return key ? responses[key] : null;
    }
    function json(res, body, status = 200) {
        res.statusCode = status;
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify(body ?? null));
    }
    const empty_ipc = () => ({ ok: true, data: {} });
    const clone = (value) => (value === undefined ? value : structuredClone(value));
    // t274: /v1/config 进程内可变状态——GET 返回最近一次 POST 的 config，
    // 使「设置页切换主题/accent → 刷新保持」在 web e2e 可验证。
    const initial_config = clone(responses["GET /v1/config"] ?? empty_ipc());
    const initial_connectors = clone(responses["GET /v1/connectors"] ?? []);
    let config_state = clone(initial_config);
    let connector_state = clone(initial_connectors);
    let id_counter = 0;
    const sse_clients = new Set();

    function next_id(prefix) {
        id_counter += 1;
        return `mock-${prefix}-${String(id_counter)}`;
    }

    function current_plugins() {
        const plugins = config_state?.config?.plugins;
        return Array.isArray(plugins) ? plugins : [];
    }

    function connector_from_plugin(plugin, template) {
        const fallback_providers = [plugin.name.toLowerCase()];
        const base = template ?? {
            instanceId: plugin.instanceId,
            sourceInstanceId: plugin.instanceId,
            stateId: plugin.stateId,
            name: plugin.name,
            displayName: plugin.displayName ?? plugin.name,
            enabled: plugin.enabled,
            source: "poll",
            supportedProviders: fallback_providers,
            activeProviders: fallback_providers,
            metadata: {
                name: plugin.name.toLowerCase(),
                parameters: [],
                endpoints: {},
                supportedProviders: fallback_providers,
                defaultSource: "poll",
            },
            snapshot: { status: "idle" },
        };
        return {
            ...clone(base),
            instanceId: plugin.instanceId,
            sourceInstanceId: plugin.instanceId,
            stateId: plugin.stateId,
            name: plugin.name,
            displayName: plugin.displayName ?? base.displayName ?? plugin.name,
            enabled: plugin.enabled,
        };
    }

    function sync_connectors() {
        const plugins = current_plugins();
        if (plugins.length === 0 && !Array.isArray(config_state?.config?.plugins)) {
            connector_state = clone(initial_connectors);
            return;
        }
        const current_by_id = new Map(connector_state.map((item) => [item.instanceId, item]));
        connector_state = plugins.map((plugin) => {
            const template =
                current_by_id.get(plugin.instanceId) ??
                initial_connectors.find((item) => item.name === plugin.name) ??
                initial_connectors.find(
                    (item) => item.metadata?.name?.toLowerCase() === plugin.name.toLowerCase(),
                );
            return connector_from_plugin(plugin, template);
        });
    }

    function publish_sse(event, data) {
        const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        for (const client of sse_clients) {
            if (client.destroyed || client.writableEnded) {
                sse_clients.delete(client);
                continue;
            }
            client.write(frame);
        }
    }

    function handle_sse(req, res) {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        res.flushHeaders?.();
        sse_clients.add(res);
        const cleanup = () => {
            sse_clients.delete(res);
        };
        req.on?.("close", cleanup);
        res.on?.("close", cleanup);
    }

    function read_body(req, on_end, on_error) {
        let body = "";
        req.setEncoding?.("utf8");
        req.on("data", (chunk) => {
            body += typeof chunk === "string" ? chunk : String(chunk);
        });
        req.on("end", () => on_end(body));
        req.on("error", on_error);
    }

    function handle_config_body(
        req,
        res,
        on_parsed,
        invalid_body = {
            code: "VALIDATION_ERROR",
            message: "Invalid JSON",
        },
    ) {
        if (typeof req.on !== "function") {
            json(res, invalid_body, 400);
            return;
        }
        read_body(
            req,
            (body) => {
                let parsed;
                try {
                    parsed = JSON.parse(body);
                } catch {
                    json(res, invalid_body, 400);
                    return;
                }
                on_parsed(parsed);
            },
            () => {
                if (!res.writableEnded) {
                    json(res, invalid_body, 400);
                }
            },
        );
    }

    function save_config(next_config) {
        config_state = { ...config_state, config: clone(next_config) };
        sync_connectors();
        publish_sse("config", next_config);
    }

    function valid_config(value) {
        return (
            value &&
            typeof value === "object" &&
            !Array.isArray(value) &&
            value.schemaVersion === 1 &&
            typeof value.language === "string" &&
            Array.isArray(value.plugins) &&
            typeof value.launchAtLogin === "boolean" &&
            (value.theme === undefined || ["light", "dark", "system"].includes(value.theme))
        );
    }

    function find_template(manifest_id) {
        const key = String(manifest_id).toLowerCase();
        return (
            current_plugins().find((item) => item.name?.toLowerCase() === key) ??
            connector_state.find(
                (item) =>
                    item.name?.toLowerCase() === key || item.metadata?.name?.toLowerCase() === key,
            ) ??
            initial_connectors.find(
                (item) =>
                    item.name?.toLowerCase() === key || item.metadata?.name?.toLowerCase() === key,
            )
        );
    }

    function plugin_from_template(template, manifest_id, instance_id) {
        const metadata = template?.metadata ?? {};
        const defaults = Object.fromEntries(
            (metadata.parameters ?? [])
                .filter((parameter) => parameter.defaultValue !== undefined)
                .map((parameter) => [parameter.name, parameter.defaultValue]),
        );
        return {
            instanceId: instance_id,
            stateId: next_id("state"),
            name: template?.name ?? String(manifest_id).toUpperCase(),
            enabled: true,
            executablePath: template?.executablePath ?? `mock://${String(manifest_id)}`,
            refreshIntervalSeconds: template?.refreshIntervalSeconds ?? 0,
            parameterValues: {
                ...defaults,
                ...(template?.parameterValues ?? {}),
            },
            endpointOverrides: {
                ...(metadata.endpoints ?? {}),
                ...(template?.endpointOverrides ?? {}),
            },
        };
    }

    function catalog_entries() {
        const entries = [];
        const seen = new Set();
        for (const connector of [...initial_connectors, ...connector_state]) {
            const manifest_id = connector.metadata?.name ?? connector.name?.toLowerCase();
            if (!manifest_id || seen.has(manifest_id)) continue;
            seen.add(manifest_id);
            const providers = connector.supportedProviders ??
                connector.activeProviders ??
                connector.metadata?.supportedProviders ?? [manifest_id];
            entries.push({
                manifest_id,
                source: connector.source ?? connector.metadata?.defaultSource ?? "poll",
                supported_providers: providers,
                metadata: clone(
                    connector.metadata ?? {
                        name: manifest_id,
                        parameters: [],
                        endpoints: {},
                        supportedProviders: providers,
                        defaultSource: connector.source ?? "poll",
                    },
                ),
            });
        }
        return entries;
    }

    sync_connectors();
    return (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname;
        const exact = `${req.method} ${url.pathname}${url.search}`;
        if (req.method === "GET" && path === "/v1/events") {
            return handle_sse(req, res);
        }
        // t274: /v1/config 是进程内可变状态，必须先于录制快照 exact 匹配处理，
        // 否则 fixture 里的 "GET /v1/config" 会让 GET 永远返回录制值，
        // POST 的更新无法被读回（刷新保持无从验证）。
        if (path === "/v1/config" && req.method === "GET") {
            return json(res, config_state);
        }
        // t274: 测试隔离——popup 偏好写回（activeUsageTab/expandedProviders 等）会
        // 经 config.save 持久化到 mock，污染后续 spec 初始状态；test_web fixture
        // 每用例开跑前 POST 此端点把 config 复位到录制 fixture。
        if (path === "/v1/config/reset" && req.method === "POST") {
            config_state = clone(initial_config);
            sync_connectors();
            return json(res, empty_ipc());
        }
        if (path === "/v1/config" && req.method === "POST") {
            return handle_config_body(
                req,
                res,
                (parsed) => {
                    save_config(parsed);
                    json(res, empty_ipc());
                },
                { ok: false, error: "Invalid JSON" },
            );
        }
        if (path === "/v1/config/duplicate" && req.method === "POST") {
            return handle_config_body(req, res, (payload) => {
                const source_id = payload?.instanceId;
                const source = current_plugins().find((plugin) => plugin.instanceId === source_id);
                if (!source) {
                    return json(res, { code: "NOT_FOUND", message: "连接器不存在" }, 404);
                }
                const instance_id = next_id("instance");
                const duplicate = {
                    ...clone(source),
                    instanceId: instance_id,
                    stateId: next_id("state"),
                    ...(source.displayName ? { displayName: `${source.displayName} (副本)` } : {}),
                };
                save_config({
                    ...config_state.config,
                    plugins: [...current_plugins(), duplicate],
                });
                return json(res, { instanceId: instance_id });
            });
        }
        if (path === "/v1/config/createInstance" && req.method === "POST") {
            return handle_config_body(req, res, (payload) => {
                const manifest_id = payload?.manifestId;
                const base_config = config_state.config;
                const template = find_template(manifest_id);
                if (!base_config || !manifest_id || !template) {
                    return json(res, { code: "NOT_FOUND", message: "连接器清单不存在" }, 404);
                }
                const instance_id = next_id("instance");
                const created = plugin_from_template(template, manifest_id, instance_id);
                save_config({
                    ...base_config,
                    plugins: [...current_plugins(), created],
                    removedConnectorIds: (base_config.removedConnectorIds ?? []).filter(
                        (id) => id !== manifest_id,
                    ),
                });
                return json(res, { instanceId: instance_id });
            });
        }
        if (path === "/v1/config/import" && req.method === "POST") {
            const invalid = { code: "VALIDATION_ERROR", message: "导入的配置格式无效" };
            return handle_config_body(
                req,
                res,
                (parsed) => {
                    if (!valid_config(parsed)) return json(res, invalid, 400);
                    save_config(parsed);
                    return json(res, { imported: true });
                },
                invalid,
            );
        }
        if (path === "/v1/health") return json(res, { ok: true });
        if (req.method === "GET" && path === "/v1/connectors") {
            return json(res, connector_state);
        }
        if (req.method === "GET" && path === "/v1/catalog") {
            return json(res, catalog_entries());
        }
        if (req.method === "GET" && /^\/v1\/connectors\/[^/]+\/state$/.test(path)) {
            const id = decodeURIComponent(path.split("/")[3] ?? "");
            const connector = connector_state.find((item) => item.instanceId === id);
            return json(
                res,
                connector?.snapshot ?? responses[`GET /v1/connectors/${id}/state`] ?? empty_ipc(),
            );
        }
        if (responses[exact] !== undefined) return json(res, responses[exact]);
        if (req.method === "GET" && path === "/v1/secrets") {
            const id = url.searchParams.get("instanceId");
            const key = id ? `GET /v1/secrets?instanceId=${id}` : null;
            return json(res, (key && responses[key]) ?? empty_ipc());
        }
        if (req.method === "GET" && path === "/v1/trend") {
            return json(res, responses[`GET /v1/trend?${url.searchParams.toString()}`] ?? []);
        }
        if (req.method === "GET" && path === "/v1/sessions") {
            // t266: 会话库过滤/排序/分页（对齐真实 query_sessions 语义）。无参数时返回全集。
            const sp = url.searchParams;
            const all = responses["GET /v1/sessions"] ?? [];
            let rows = [...all];
            const search = sp.get("search");
            if (search) {
                const needle = search.toLowerCase();
                rows = rows.filter((s) =>
                    [s.title, s.directory, s.id]
                        .filter(Boolean)
                        .some((v) => String(v).toLowerCase().includes(needle)),
                );
            }
            const sources = sp.get("sources");
            if (sources) {
                const set = new Set(sources.split(","));
                rows = rows.filter((s) => set.has(s.source));
            }
            const order_by = sp.get("order_by");
            const direction = sp.get("direction");
            if (order_by && direction) {
                const mul = direction === "asc" ? 1 : -1;
                rows.sort((a, b) => {
                    const av =
                        order_by === "tokens"
                            ? a.input_tokens +
                              a.output_tokens +
                              a.cache_read_tokens +
                              a.cache_write_tokens
                            : (a[order_by] ?? 0);
                    const bv =
                        order_by === "tokens"
                            ? b.input_tokens +
                              b.output_tokens +
                              b.cache_read_tokens +
                              b.cache_write_tokens
                            : (b[order_by] ?? 0);
                    return (av - bv) * mul;
                });
            }
            const limit = Number(sp.get("limit"));
            const offset = Number(sp.get("offset") ?? "0");
            if (Number.isFinite(limit) && limit > 0) {
                rows = rows.slice(offset, offset + limit);
            } else if (offset > 0) {
                rows = rows.slice(offset);
            }
            return json(res, rows);
        }
        if (
            req.method === "GET" &&
            ["/v1/records", "/v1/sessionStats", "/v1/buckets", "/v1/status", "/v1/rollup"].includes(
                path,
            )
        ) {
            return json(res, responses[`${req.method} ${path}`] ?? []);
        }
        if (req.method === "GET" && path === "/v1/sessionHistory") {
            const id = url.searchParams.get("id");
            return json(
                res,
                (id && responses[`GET /v1/sessionHistory?id=${id}`]) ?? {
                    messages: [],
                    next_cursor: null,
                },
            );
        }
        if (req.method === "POST") return json(res, empty_ipc());
        json(res, { error: `unmatched ${exact}` }, 404);
    };
}

function main() {
    if (!existsSync(RESP_FILE)) {
        const hint =
            process.env["MOCK_FIXTURE"] === "synthetic"
                ? "先跑 pnpm e2e:gen-synthetic"
                : "先跑 pnpm e2e:gen-data";
        console.error(`[mock_server] ${RESP_FILE} 不存在，${hint}`);
        process.exit(1);
    }
    const responses = JSON.parse(readFileSync(RESP_FILE, "utf8"));
    const handler = create_mock_handler(responses);
    createServer(handler).listen(PORT, () => console.log(`[mock_server] listening on ${PORT}`));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

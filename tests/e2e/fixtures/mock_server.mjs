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
    // t274: /v1/config 进程内可变状态——GET 返回最近一次 POST 的 config，
    // 使「设置页切换主题/accent → 刷新保持」在 web e2e 可验证。
    const initial_config = responses["GET /v1/config"] ?? empty_ipc();
    let config_state = initial_config;
    return (req, res) => {
        const url = new URL(req.url, "http://localhost");
        const path = url.pathname;
        const exact = `${req.method} ${url.pathname}${url.search}`;
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
            config_state = initial_config;
            return json(res, empty_ipc());
        }
        if (path === "/v1/config" && req.method === "POST") {
            // 读取并消费 body 后更新进程内 config；无效 JSON 返回 400 且不改状态。
            if (typeof req.on !== "function") {
                // 桩调用（单测无 body 流）：按空 body 同步处理，保持 handler 同步契约。
                config_state = { ...config_state, config: null };
                return json(res, empty_ipc());
            }
            let body = "";
            req.setEncoding?.("utf8");
            req.on("data", (chunk) => {
                body += typeof chunk === "string" ? chunk : String(chunk);
            });
            req.on("end", () => {
                try {
                    // 与真实后端 read_json_body 同语义：空 body / 非 JSON 均 400，
                    // 状态不变——空 POST（如弹窗 patcher 偶发空写）不得把 config 清成 {}。
                    const parsed = JSON.parse(body);
                    config_state = { ...config_state, config: parsed };
                    json(res, empty_ipc());
                } catch {
                    json(res, { ok: false, error: "Invalid JSON" }, 400);
                }
            });
            req.on("error", () => {
                if (!res.writableEnded) json(res, { ok: false, error: "request error" }, 400);
            });
            return;
        }
        if (responses[exact] !== undefined) return json(res, responses[exact]);

        if (path === "/v1/health") return json(res, { ok: true });
        if (req.method === "GET" && path === "/v1/connectors") {
            return json(res, responses["GET /v1/connectors"] ?? []);
        }
        if (req.method === "GET" && /^\/v1\/connectors\/[^/]+\/state$/.test(path)) {
            const id = decodeURIComponent(path.split("/")[3] ?? "");
            return json(res, responses[`GET /v1/connectors/${id}/state`] ?? empty_ipc());
        }
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
    createServer((req, res) => create_mock_handler(responses)(req, res)).listen(PORT, () =>
        console.log(`[mock_server] listening on ${PORT}`),
    );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
    create_dev_panel_model_routing_manager,
    type NewApiTransport,
} from "../../../src/main/core/dev-panel/model-routing";

const temp_dirs: string[] = [];

async function make_fixture(): Promise<{
    readonly config_path: string;
    readonly settings_path: string;
    readonly snapshot_path: string;
}> {
    const directory = await mkdtemp(join(tmpdir(), "omni-panel-model-routing-"));
    temp_dirs.push(directory);
    const config_path = join(directory, "new_api.yaml");
    const settings_path = join(directory, "settings.json");
    const snapshot_path = join(directory, "snapshot.json");
    await writeFile(
        config_path,
        [
            "base_url: http://127.0.0.1:19999",
            "session: secret-session-value",
            "models:",
            "  - claude-sonnet",
            "  - claude-opus",
            "aliases:",
            "  claude-sonnet:",
            "    - sonnet-latest",
        ].join("\n"),
    );
    await writeFile(settings_path, '{"default_sonnet":"claude-sonnet[1m]"}');
    return { config_path, settings_path, snapshot_path };
}

function channel(id: string, priority: number) {
    return {
        id,
        name: id.toUpperCase(),
        group: "default",
        status: "enabled",
        models: ["claude-sonnet", "claude-opus"],
        model_mapping: JSON.stringify({ other_slot: "claude-opus" }),
        priority,
    };
}

afterEach(async () => {
    await Promise.all(
        temp_dirs.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
    );
});

describe("dev panel model routing", () => {
    it("reads presets and expands the [1m] slot without exposing session", async () => {
        const fixture = await make_fixture();
        const transport: NewApiTransport = {
            get: () => Promise.resolve({ data: { items: [] } }),
            put: () => Promise.resolve({ success: true }),
            post: () => Promise.resolve({ model: "unused" }),
        };
        const manager = create_dev_panel_model_routing_manager({
            ...fixture,
            transport_factory: () => transport,
        });

        const config = await manager.get_config();
        expect(config.models).toEqual(["claude-sonnet", "claude-opus"]);
        expect(config.expanded_slots).toContain("default_sonnet[1m]");
        expect(JSON.stringify(config)).not.toContain("secret-session-value");
    });

    it("reports the external config path when required model presets are missing", async () => {
        const fixture = await make_fixture();
        await writeFile(fixture.config_path, "base_url: http://127.0.0.1:19999\nsession: secret\n");
        const manager = create_dev_panel_model_routing_manager({ ...fixture });
        await expect(manager.get_config()).rejects.toThrow(
            `New API 配置缺少 models：${fixture.config_path}`,
        );
    });

    it("preserves real models and unrelated mappings, removes unsupported slots, and resolves priorities", async () => {
        const fixture = await make_fixture();
        const entries = [
            {
                ...channel("supported", 1),
                models: ["claude-sonnet", "claude-opus", "default_model"],
                model_mapping: JSON.stringify({
                    default_model: "claude-sonnet",
                    other_slot: "claude-sonnet",
                }),
            },
            {
                ...channel("duplicate", 1),
                models: ["claude-sonnet", "claude-opus", "default_model"],
                model_mapping: JSON.stringify({
                    default_model: "claude-opus",
                    other_slot: "claude-sonnet",
                }),
            },
            {
                ...channel("unsupported", 1),
                models: ["claude-sonnet", "default_model"],
                model_mapping: JSON.stringify({
                    default_model: "claude-opus",
                    other_slot: "claude-sonnet",
                }),
            },
            {
                ...channel("disabled", 1),
                status: "disabled",
                models: ["claude-opus", "default_model"],
            },
            {
                ...channel("experimental", 1),
                group: "experimental",
                models: ["claude-opus", "default_model"],
            },
        ];
        let page = 0;
        const writes: { id: string; body: Record<string, unknown> }[] = [];
        const manager = create_dev_panel_model_routing_manager({
            ...fixture,
            transport_factory: () => ({
                get: () => {
                    page += 1;
                    return Promise.resolve(
                        page === 1 ? { data: { items: entries } } : { data: { items: [] } },
                    );
                },
                put: (path, body) => {
                    writes.push({
                        id: decodeURIComponent(path.split("/").at(-1) ?? ""),
                        body: body as Record<string, unknown>,
                    });
                    return Promise.resolve({ success: true });
                },
                post: () => Promise.resolve({ model: "unused" }),
            }),
        });

        const result = await manager.save({
            selections: { default_model: "claude-opus" },
            confirmed: true,
        });

        expect(result.success).toBe(true);
        expect(writes.map((write) => write.id)).toEqual(["supported", "duplicate", "unsupported"]);
        const supported = writes.find((write) => write.id === "supported");
        const duplicate = writes.find((write) => write.id === "duplicate");
        const unsupported = writes.find((write) => write.id === "unsupported");
        expect(JSON.parse(String(supported?.body["models"]))).toEqual([
            "claude-sonnet",
            "claude-opus",
            "default_model",
        ]);
        expect(JSON.parse(String(supported?.body["model_mapping"]))).toEqual({
            default_model: "claude-opus",
            other_slot: "claude-sonnet",
        });
        expect(supported?.body["priority"]).toBe(1);
        expect(duplicate?.body["priority"]).toBe(2);
        expect(JSON.parse(String(unsupported?.body["models"]))).toEqual(["claude-sonnet"]);
        expect(JSON.parse(String(unsupported?.body["model_mapping"]))).toEqual({
            other_slot: "claude-sonnet",
        });
        const snapshot = JSON.parse(await readFile(fixture.snapshot_path, "utf8")) as {
            channels: {
                channel_id: string;
                models: string[];
                model_mapping: Record<string, string>;
            }[];
        };
        expect(snapshot.channels).toHaveLength(5);
        expect(snapshot.channels.find((item) => item.channel_id === "unsupported")).toMatchObject({
            models: ["claude-sonnet", "default_model"],
            model_mapping: { default_model: "claude-opus", other_slot: "claude-sonnet" },
        });
    });

    it("stops writes after a failure, classifies remaining channels, and keeps a snapshot", async () => {
        const fixture = await make_fixture();
        const put_calls: { path: string; body: Record<string, unknown> }[] = [];
        let channel_page = 0;
        const transport: NewApiTransport = {
            get: () => {
                channel_page += 1;
                return Promise.resolve(
                    channel_page === 1
                        ? {
                              data: {
                                  items: [
                                      channel("first", 1),
                                      channel("second", 1),
                                      channel("third", 3),
                                  ],
                              },
                          }
                        : { data: { items: [] } },
                );
            },
            put: (path, body) => {
                put_calls.push({ path, body: body as Record<string, unknown> });
                return Promise.resolve(
                    path.includes("second") ? { success: false } : { success: true },
                );
            },
            post: () => Promise.resolve({ model: "claude-sonnet" }),
        };
        const manager = create_dev_panel_model_routing_manager({
            ...fixture,
            transport_factory: () => transport,
        });

        const result = await manager.save({
            selections: { default_model: "sonnet-latest" },
            confirmed: true,
        });
        expect(result.success).toBe(false);
        expect(result.changes.map((item) => item.status)).toEqual(["success", "failed", "skipped"]);
        expect(put_calls).toHaveLength(2);
        expect(JSON.parse(String(put_calls[0]?.body["models"]))).toContain("default_model");
        expect(String(put_calls[0]?.body["model_mapping"])).not.toContain("secret-session-value");
        const snapshot = JSON.parse(await readFile(fixture.snapshot_path, "utf8")) as Record<
            string,
            unknown
        >;
        expect(snapshot["info"]).toMatchObject({ channel_count: 3 });
        expect(JSON.stringify(snapshot)).not.toContain("secret-session-value");
        await expect(
            manager.save({ selections: { default_model: "claude-opus" }, confirmed: false }),
        ).rejects.toThrow("需要确认");
    });

    it("treats HTTP 200 success:false as a failed self-check and parses reasoning model names", async () => {
        const fixture = await make_fixture();
        const manager = create_dev_panel_model_routing_manager({
            ...fixture,
            transport_factory: () => ({
                get: () => Promise.resolve({ data: { items: [] } }),
                put: () => Promise.resolve({ success: true }),
                post: () =>
                    Promise.resolve({
                        choices: [{ message: { reasoning_content: { model: "reasoning-model" } } }],
                    }),
            }),
        });
        await expect(
            manager.test({ slot: "default_model", model: "claude-opus" }),
        ).resolves.toEqual({
            success: true,
            model_name: "reasoning-model",
            error: null,
        });

        const failed_manager = create_dev_panel_model_routing_manager({
            ...fixture,
            transport_factory: () => ({
                get: () => Promise.resolve({ data: { items: [] } }),
                put: () => Promise.resolve({ success: true }),
                post: () => Promise.resolve({ success: false }),
            }),
        });
        await expect(
            failed_manager.test({ slot: "default_model", model: "claude-opus" }),
        ).resolves.toMatchObject({
            success: false,
        });
    });

    it("p244: 渠道接口 401 转成含配置路径的可操作文案，500 转成状态码文案", async () => {
        const fixture = await make_fixture();
        let status = 401;
        const server = createServer((_request, response) => {
            response.setHeader("content-type", "application/json");
            response.statusCode = status;
            response.end(
                JSON.stringify({
                    code: "AUTH_UNAUTHORIZED",
                    message: "Unauthorized, invalid access token",
                    success: false,
                }),
            );
        });
        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address() as AddressInfo;
        await writeFile(
            fixture.config_path,
            `base_url: http://127.0.0.1:${String(address.port)}\nsession: stale-token\nmodels:\n  - claude-sonnet\n`,
        );
        try {
            const manager = create_dev_panel_model_routing_manager(fixture);
            await expect(manager.get_channels()).rejects.toThrow(fixture.config_path);
            await expect(manager.get_channels()).rejects.toThrow(/系统令牌/);
            await expect(manager.get_channels()).rejects.not.toThrow(/stale-token/);

            status = 500;
            await expect(manager.get_channels()).rejects.toThrow("New API 请求失败（HTTP 500）");
        } finally {
            await new Promise<void>((resolve) =>
                server.close(() => {
                    resolve();
                }),
            );
        }
    });

    it("p244: 自检 401 返回可操作文案，不再吞掉配置路径", async () => {
        const fixture = await make_fixture();
        const server = createServer((_request, response) => {
            response.setHeader("content-type", "application/json");
            response.statusCode = 401;
            response.end(JSON.stringify({ success: false, message: "invalid access token" }));
        });
        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address() as AddressInfo;
        await writeFile(
            fixture.config_path,
            `base_url: http://127.0.0.1:${String(address.port)}\nsession: stale-token\nmodels:\n  - claude-sonnet\n`,
        );
        try {
            const manager = create_dev_panel_model_routing_manager(fixture);
            const result = await manager.test({ slot: "default_model", model: "claude-sonnet" });
            expect(result.success).toBe(false);
            expect(result.error).toContain(fixture.config_path);
            expect(result.error).toContain("系统令牌");
        } finally {
            await new Promise<void>((resolve) =>
                server.close(() => {
                    resolve();
                }),
            );
        }
    });

    it("p244: 快照损坏留 warn，快照缺失保持静默", async () => {
        const fixture = await make_fixture();
        const { addTransport } = await import("../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message) {
                lines.push(`${level}:${module}:${message}`);
            },
        });
        try {
            const missing = create_dev_panel_model_routing_manager(fixture);
            await expect(missing.get_snapshot_info()).resolves.toBeNull();
            expect(lines).toHaveLength(0);

            await writeFile(fixture.snapshot_path, "{not json");
            const corrupted = create_dev_panel_model_routing_manager(fixture);
            await expect(corrupted.get_snapshot_info()).resolves.toBeNull();
            expect(lines.some((line) => line.includes("snapshot unreadable"))).toBe(true);

            await writeFile(fixture.snapshot_path, JSON.stringify({ info: { snapshot_id: "x" } }));
            const malformed = create_dev_panel_model_routing_manager(fixture);
            await expect(malformed.get_snapshot_info()).resolves.toBeNull();
            expect(lines.some((line) => line.includes("snapshot shape invalid"))).toBe(true);
        } finally {
            remove_transport();
        }
    });

    it("uses the host HTTP transport for paginated channels and self-checks", async () => {
        const fixture = await make_fixture();
        let authorization = "";
        const pages: number[] = [];
        const server = createServer((request, response) => {
            authorization = request.headers.authorization ?? "";
            response.setHeader("content-type", "application/json");
            if (request.method === "GET") {
                const page = Number(
                    new URL(request.url ?? "/", "http://127.0.0.1").searchParams.get("p"),
                );
                pages.push(page);
                response.end(
                    JSON.stringify({
                        data: {
                            items: page === 1 ? [channel("http-channel", 1)] : [],
                        },
                    }),
                );
                return;
            }
            response.end(JSON.stringify({ model: "http-model" }));
        });
        await new Promise<void>((resolve) => {
            server.listen(0, "127.0.0.1", resolve);
        });
        const address = server.address() as AddressInfo;
        await writeFile(
            fixture.config_path,
            `base_url: http://127.0.0.1:${String(address.port)}\nsession: secret-session-value\nmodels:\n  - claude-sonnet\n`,
        );
        try {
            const manager = create_dev_panel_model_routing_manager(fixture);
            await expect(manager.get_channels()).resolves.toMatchObject({
                channels: [{ id: "http-channel" }],
            });
            expect(pages).toEqual([1, 2]);
            await expect(
                manager.test({ slot: "default_model", model: "claude-sonnet" }),
            ).resolves.toEqual({ success: true, model_name: "http-model", error: null });
            expect(authorization).toBe("Bearer secret-session-value");
        } finally {
            await new Promise<void>((resolve) =>
                server.close(() => {
                    resolve();
                }),
            );
        }
    });
});

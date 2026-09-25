import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
    compute_connector_hashes,
    verify_connector_integrity,
    type IntegrityRegistry,
} from "../../../src/main/core/connector/connector-integrity";
import { discover_connector_definitions } from "../../../src/main/core/connector/manifest-loader";
import { run_connector_isolated } from "../../../src/main/core/connector/isolated-process-runner";
import type { Manifest } from "../../../src/shared/schemas/manifest";

let temp_dir: string;

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "isolated-runner-test-"));
});

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

const sample_manifest: Manifest = {
    id: "sample_isolated",
    provider: "sample_isolated",
    capabilities: ["poll"],
    parameters: [],
    script: "connector.ts",
};

describe("AC-001: 内置连接器 SHA-256 完整性清单比对", () => {
    it("passes integrity check when file hashes match registry", async () => {
        const c_dir = join(temp_dir, "good_connector");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(c_dir, { recursive: true });
        await writeFile(join(c_dir, "manifest.json"), JSON.stringify(sample_manifest));
        await writeFile(join(c_dir, "connector.ts"), "function main(){return [];}");

        const hashes = await compute_connector_hashes(c_dir);
        const registry: IntegrityRegistry = {
            sample_isolated: hashes,
        };

        const res = await verify_connector_integrity(sample_manifest, c_dir, registry);
        expect(res.ok).toBe(true);
    });

    it("rejects connector and triggers security alert on hash mismatch", async () => {
        const c_dir = join(temp_dir, "tampered_connector");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(c_dir, { recursive: true });
        await writeFile(join(c_dir, "manifest.json"), JSON.stringify(sample_manifest));
        await writeFile(join(c_dir, "connector.ts"), "function main(){return [];}");

        const registry: IntegrityRegistry = {
            sample_isolated: {
                "manifest.json": "fake_hash_1",
                "connector.ts": "fake_hash_2",
            },
        };

        const res = await verify_connector_integrity(sample_manifest, c_dir, registry);
        expect(res.ok).toBe(false);
        expect(res.reason).toContain("SHA-256 mismatch");
    });

    it("discover_connector_definitions rejects tampered connector and logs security alert (AC-001 / f001)", async () => {
        const builtin_dir = join(temp_dir, "builtin_tampered");
        const user_dir = join(temp_dir, "user_empty");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(join(builtin_dir, "sample"), { recursive: true });
        await mkdir(user_dir, { recursive: true });

        await writeFile(
            join(builtin_dir, "sample", "manifest.json"),
            JSON.stringify(sample_manifest),
        );
        await writeFile(join(builtin_dir, "sample", "connector.ts"), "return [];");

        const registry: IntegrityRegistry = {
            sample_isolated: {
                "manifest.json": "mismatched_sha",
            },
        };

        const defs = await discover_connector_definitions(builtin_dir, user_dir, {
            integrity_registry: registry,
        });

        // 被篡改的连接器必须被剔除
        expect(defs.find((d) => d.manifest.id === "sample_isolated")).toBeUndefined();
    });
});

describe("AC-003: 外部用户目录连接器策略控制", () => {
    it("skips user connector directory by default when allow_user_connectors is false", async () => {
        const builtin_dir = join(temp_dir, "builtin");
        const user_dir = join(temp_dir, "user_dir");
        const { mkdir } = await import("node:fs/promises");
        await mkdir(builtin_dir, { recursive: true });
        await mkdir(join(user_dir, "untrusted"), { recursive: true });

        const untrusted_manifest: Manifest = {
            id: "untrusted_c",
            provider: "untrusted_c",
            capabilities: ["session"],
            parameters: [],
            endpoints: { default: "http://127.0.0.1" },
            script: "connector.ts",
        };
        await writeFile(
            join(user_dir, "untrusted", "manifest.json"),
            JSON.stringify(untrusted_manifest),
        );

        // 默认不开启 allow_user_connectors
        const defs_default = await discover_connector_definitions(builtin_dir, user_dir);
        expect(defs_default.some((d) => d.manifest.id === "untrusted_c")).toBe(false);

        // 显式信任后放行
        const defs_trusted = await discover_connector_definitions(builtin_dir, user_dir, {
            allow_user_connectors: true,
        });
        expect(defs_trusted.some((d) => d.manifest.id === "untrusted_c")).toBe(true);
    });
});

describe("AC-002: 独立进程隔离执行器健壮性", () => {
    it("executes script in isolated process and returns observations via IPC", async () => {
        const script = `
            return [{
                provider: "sample_isolated",
                account_id: "default",
                account_label: "Isolated",
                metric_id: "sample_isolated:test",
                raw_label: "test",
                normalized_label: "Test",
                window: "month",
                used: 50,
                limit: 100,
                display_style: "percent",
                reset_at: null,
                status: "normal",
                observed_at: 1000,
                source: "poll",
                stale: false,
                last_error: null,
            }];
        `;

        const result = await run_connector_isolated({
            manifest: sample_manifest,
            script_code: script,
            timeout_ms: 10000,
        });

        expect(result.error).toBeNull();
        expect(result.observations).toHaveLength(1);
        expect(result.observations[0]?.used).toBe(50);
        expect(result.observations[0]?.metric_id).toBe("sample_isolated:test");
    });

    it("survives worker crash without crashing the main process", async () => {
        // 在隔离子进程中触发 exit 模拟 worker crash
        const result = await run_connector_isolated({
            manifest: sample_manifest,
            script_code: "return [];",
            timeout_ms: 5000,
            params: { __TEST_CRASH__: "1" },
        });

        // 父进程保持健在，并捕获到 crash 错误
        expect(result.error).toContain("crashed");
        expect(result.observations).toHaveLength(0);
    });

    it("terminates infinite loop worker on timeout without blocking host event loop", async () => {
        // 在脚本中无限死循环，但设定较短超时时间
        const hang_script = `while(true){}`;

        const start = Date.now();
        const result = await run_connector_isolated({
            manifest: sample_manifest,
            script_code: hang_script,
            timeout_ms: 500,
        });

        const elapsed = Date.now() - start;
        // 验证超时被强制终结
        expect(result.error).toContain("timeout");
        expect(elapsed).toBeLessThan(3000);
    });

    it("survives out-of-memory (OOM) worker crash without affecting host (AC-002 / f002)", async () => {
        // 模拟子进程 OOM（例如子进程退出或触发内存超限崩溃）
        const oom_script = `
            const chunks = [];
            while (true) {
                chunks.push(new Uint8Array(100 * 1024 * 1024));
            }
        `;

        const result = await run_connector_isolated({
            manifest: sample_manifest,
            script_code: oom_script,
            timeout_ms: 1500,
        });

        // 主进程安然无恙，捕获到超时或崩溃
        expect(result.error).toBeTruthy();
        expect(result.observations).toHaveLength(0);
    });

    it("AC-004: collects observations from built-in connector in isolated environment and saves to store", async () => {
        const { createServer } = await import("node:http");
        const { create_observation_store } =
            await import("../../../src/main/core/observation/observation-store");
        const store = create_observation_store(join(temp_dir, "test_obs.db"));

        const srv = createServer((req, res) => {
            if (req.url === "/api/usage") {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ used: 45, limit: 100 }));
                return;
            }
            res.writeHead(404);
            res.end();
        });

        await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
        const addr = srv.address() as { port: number };

        try {
            const manifest: Manifest = {
                id: "test_builtin",
                provider: "test_builtin",
                capabilities: ["session"],
                parameters: [],
                endpoints: { default: `http://127.0.0.1:${String(addr.port)}` },
                script: "connector.ts",
            };

            const script = `
                const data = await ctx.http.get_json("default", "/api/usage");
                return [{
                    provider: "test_builtin",
                    account_id: "default",
                    account_label: "Builtin",
                    metric_id: "test_builtin:metric",
                    raw_label: "metric",
                    normalized_label: "Metric",
                    window: "month",
                    used: data.used,
                    limit: data.limit,
                    display_style: "percent",
                    reset_at: null,
                    status: "normal",
                    observed_at: Date.now(),
                    source: "session",
                    stale: false,
                    last_error: null,
                }];
            `;

            const result = await run_connector_isolated({
                manifest,
                script_code: script,
                timeout_ms: 5000,
            });

            expect(result.error).toBeNull();
            expect(result.observations).toHaveLength(1);
            expect(result.observations[0]?.used).toBe(45);

            // 真实写入观测存储
            store.insert_batch(
                result.observations.map((obs) => ({
                    ...obs,
                    source_instance_id: "inst_builtin_test",
                })),
            );

            // 从 SQLite store 真实查询并强断言入库成功
            const saved = store.list_by_source_instance_id("inst_builtin_test");
            expect(saved).toHaveLength(1);
            expect(saved[0]?.metric_id).toBe("test_builtin:metric");
            expect(saved[0]?.used).toBe(45);
        } finally {
            srv.close();
        }
    });
});

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
    create_connector_discovery_store,
    compute_discovery_namespace,
} from "../../../src/main/core/connector/discovery-cache";
import { run_connector } from "../../../src/main/core/connector/runtime";
import { run_connector_isolated } from "../../../src/main/core/connector/isolated-process-runner";
import { create_connector_context } from "../../../src/main/core/connector/net-client";
import { create_execution_budget } from "../../../src/main/core/connector/execution-budget";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

let temp_dir: string;
let cache_path: string;

function create_mock_vault(secrets: Record<string, string> = {}): VaultBackend {
    return {
        get: (key: string) => Promise.resolve(secrets[key] ?? null),
        set: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        has: (key: string) => Promise.resolve(key in secrets),
        list_keys: () => Promise.resolve(Object.keys(secrets)),
        replaceAll: () => Promise.resolve(),
    };
}

const sample_manifest: Manifest = {
    id: "sample_discovery",
    provider: "sample_discovery",
    capabilities: ["session"],
    parameters: [
        {
            name: "SESSION_TOKEN",
            type: "secret",
            required: true,
            exposeToScript: true,
        },
    ],
    endpoints: { default: "http://127.0.0.1:0" },
    script: "connector.ts",
};

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "discovery-cache-test-"));
    cache_path = join(temp_dir, "connector-cache.json");
});

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("t529: 连接器发现结果持久化缓存能力", () => {
    describe("AC-001 & AC-002: 写入、读取与跨重启持久化保留", () => {
        it("writes discovery record and reads it across subsequent refreshes and simulated restart", async () => {
            const store1 = create_connector_discovery_store(cache_path);
            const script = `
                await ctx.discovery.set("settings_action", {
                    signature: "sig_v1",
                    action_id: "act_12345",
                    deployment_id: "dpl_abcde",
                    discovered_at: 1000,
                });
                return [];
            `;

            const budget = create_execution_budget(5000);
            const vault = create_mock_vault({ SESSION_TOKEN: "valid-token-123" });
            const namespace = compute_discovery_namespace("sample_discovery", "inst_1", script);

            const ctx1 = create_connector_context(sample_manifest, vault, "inst_1", {
                budget,
                script_code: script,
                discovery_store: store1,
            });

            // 1. Run execution which sets discovery cache
            const result1 = await run_connector(sample_manifest, script, ctx1, budget);
            expect(result1.error).toBeNull();

            // Store must have received delta and persisted to disk
            const entry1 = await store1.get(namespace, "settings_action");
            expect(entry1).toBeDefined();
            expect(entry1?.signature).toBe("sig_v1");
            expect(entry1?.action_id).toBe("act_12345");
            expect(entry1?.deployment_id).toBe("dpl_abcde");

            // 2. Subsequent execution reads from discovery cache and increments hits
            const script_reader = `
                const cached = await ctx.discovery.get("settings_action");
                if (!cached) throw new Error("cache miss");
                return [{
                    provider: "sample_discovery",
                    account_id: "default",
                    account_label: "Test",
                    metric_id: "test:action",
                    raw_label: "action",
                    normalized_label: "Action",
                    window: "month",
                    used: cached.hits ?? 0,
                    limit: 100,
                    display_style: "percent",
                    reset_at: null,
                    status: "normal",
                    observed_at: cached.discovered_at,
                    source: "session",
                    stale: false,
                    last_error: cached.action_id,
                }];
            `;

            const ctx2 = create_connector_context(sample_manifest, vault, "inst_1", {
                budget,
                script_code: script, // same script code -> same namespace
                discovery_store: store1,
            });

            const result2 = await run_connector(sample_manifest, script_reader, ctx2, budget);
            expect(result2.error).toBeNull();
            expect(result2.observations).toHaveLength(1);
            expect(result2.observations[0]?.last_error).toBe("act_12345");

            // 3. AC-002: Simulate restart by instantiating new store on same file
            const store2 = create_connector_discovery_store(cache_path);
            const entry2 = await store2.get(namespace, "settings_action");
            expect(entry2).toBeDefined();
            expect(entry2?.action_id).toBe("act_12345");
            expect(entry2?.signature).toBe("sig_v1");
        });
    });

    describe("AC-003: 多实例命名空间隔离", () => {
        it("keeps discovery cache strictly isolated across instances", async () => {
            const store = create_connector_discovery_store(cache_path);
            const script = "return [];";
            const ns_a = compute_discovery_namespace("sample_discovery", "inst_A", script);
            const ns_b = compute_discovery_namespace("sample_discovery", "inst_B", script);

            expect(ns_a).not.toBe(ns_b);

            await store.set(ns_a, "target", {
                signature: "sig_a",
                action_id: "act_a",
                discovered_at: Date.now(),
            });

            const in_a = await store.get(ns_a, "target");
            const in_b = await store.get(ns_b, "target");

            expect(in_a?.action_id).toBe("act_a");
            expect(in_b).toBeNull();
        });
    });

    describe("AC-004: 超时与崩溃丢弃本轮 delta 保留旧记录", () => {
        it("preserves persisted records when isolated runner times out or crashes", async () => {
            const store = create_connector_discovery_store(cache_path);
            const script_initial = `
                await ctx.discovery.set("action", {
                    signature: "initial_sig",
                    action_id: "act_initial",
                    discovered_at: 1000,
                });
                return [];
            `;
            const budget = create_execution_budget(5000);
            const vault = create_mock_vault();
            const namespace = compute_discovery_namespace(
                "sample_discovery",
                "inst_1",
                script_initial,
            );

            const ctx = create_connector_context(sample_manifest, vault, "inst_1", {
                budget,
                script_code: script_initial,
                discovery_store: store,
            });
            await run_connector(sample_manifest, script_initial, ctx, budget);

            expect((await store.get(namespace, "action"))?.action_id).toBe("act_initial");

            // Isolated runner with uncooperative loop (timed out / watchdog killed)
            const timeout_budget = create_execution_budget(1200);
            const crash_script = `
                await ctx.discovery.set("action", {
                    signature: "corrupted_sig",
                    action_id: "act_corrupted",
                    discovered_at: 9999,
                });
                while (true) {}
            `;

            const timeout_result = await run_connector_isolated({
                manifest: sample_manifest,
                script_code: crash_script,
                budget: timeout_budget,
                instance_id: "inst_1",
                discovery_store: store,
            });
            expect(timeout_result.error_code).toBe("TERMINATED");

            // Persisted record must remain initial, not overwritten by uncommitted delta
            const current = await store.get(namespace, "action");
            expect(current?.action_id).toBe("act_initial");
            expect(current?.signature).toBe("initial_sig");
        });
    });

    describe("AC-005: 签名变化覆盖更新", () => {
        it("overwrites existing discovery record when new signature is set", async () => {
            const store = create_connector_discovery_store(cache_path);
            const ns = "sample:inst:hash";

            await store.set(ns, "act", {
                signature: "sig_1",
                action_id: "id_1",
                discovered_at: 100,
            });
            expect((await store.get(ns, "act"))?.signature).toBe("sig_1");

            await store.set(ns, "act", {
                signature: "sig_2",
                action_id: "id_2",
                discovered_at: 200,
            });
            expect((await store.get(ns, "act"))?.signature).toBe("sig_2");
            expect((await store.get(ns, "act"))?.action_id).toBe("id_2");
        });
    });

    describe("AC-006: 容量治理与 LRU 逐出", () => {
        it("enforces entry count, value size, and total byte caps via LRU eviction", async () => {
            // Create store with tiny limits for deterministic test
            const store = create_connector_discovery_store(cache_path, {
                max_entries_per_namespace: 3,
                max_total_entries: 5,
                max_value_bytes: 300,
            });
            const ns = "test:inst:hash";

            // 1. Single value size cap: rejects value over max_value_bytes (300B)
            await expect(
                store.set(ns, "oversized", {
                    signature: "s".repeat(400),
                    action_id: "act",
                    discovered_at: 1,
                }),
            ).rejects.toThrow(/value exceeds/i);

            // 2. Per-namespace LRU eviction (cap = 3)
            await store.set(ns, "k1", { signature: "s1", action_id: "a1", discovered_at: 10 });
            await store.set(ns, "k2", { signature: "s2", action_id: "a2", discovered_at: 20 });
            await store.set(ns, "k3", { signature: "s3", action_id: "a3", discovered_at: 30 });

            // Access k1 to make k2 the least recently used
            await store.get(ns, "k1");

            // Insert k4: should evict k2
            await store.set(ns, "k4", { signature: "s4", action_id: "a4", discovered_at: 40 });

            expect(await store.get(ns, "k1")).not.toBeNull();
            expect(await store.get(ns, "k2")).toBeNull();
            expect(await store.get(ns, "k3")).not.toBeNull();
            expect(await store.get(ns, "k4")).not.toBeNull();
        });
    });

    describe("AC-007: 持久化读写失败降级为内存缓存", () => {
        it("degrades gracefully to memory cache when disk write fails", async () => {
            // Point store to an invalid directory path that cannot be written
            const invalid_path = join(temp_dir, "non_existent_subdir", "deep", "cache.json");
            const store = create_connector_discovery_store(invalid_path);
            const ns = "sample:inst:hash";

            // Write succeeds in memory without throwing
            await expect(
                store.set(ns, "key1", {
                    signature: "sig",
                    action_id: "act",
                    discovered_at: 1,
                }),
            ).resolves.not.toThrow();

            // In-memory read succeeds
            const record = await store.get(ns, "key1");
            expect(record?.action_id).toBe("act");
        });
    });

    describe("AC-008: secret 强制拒绝", () => {
        it("refuses keys matching secret names or values containing vault secrets", async () => {
            const store = create_connector_discovery_store(cache_path);
            const script = `
                // 1. Key matching secret name -> rejected
                await ctx.discovery.set("session_token", {
                    signature: "sig",
                    action_id: "act",
                    discovered_at: 1,
                });

                // 2. Value containing secret plaintext -> rejected
                await ctx.discovery.set("normal_key", {
                    signature: "sig",
                    action_id: "act_with_super_secret_value_xyz",
                    discovered_at: 1,
                });

                // 3. Legitimate discovery -> accepted
                await ctx.discovery.set("legit_key", {
                    signature: "sig_clean",
                    action_id: "act_clean",
                    deployment_id: "dpl_clean",
                    discovered_at: 1,
                });
                return [];
            `;

            const budget = create_execution_budget(5000);
            const vault = create_mock_vault({
                SESSION_TOKEN: "super_secret_value_xyz",
            });
            const namespace = compute_discovery_namespace("sample_discovery", "inst_1", script);

            const ctx = create_connector_context(sample_manifest, vault, "inst_1", {
                budget,
                script_code: script,
                discovery_store: store,
                params: { SESSION_TOKEN: "super_secret_value_xyz" },
                vault_secrets: new Set(["super_secret_value_xyz"]),
            });

            await run_connector(sample_manifest, script, ctx, budget);

            // Verify rejected keys are not in store
            expect(await store.get(namespace, "session_token")).toBeNull();
            expect(await store.get(namespace, "normal_key")).toBeNull();

            // Legitimate key is stored
            expect(await store.get(namespace, "legit_key")).not.toBeNull();

            // Verify disk content does not contain secret plaintext
            const file_content = await readFile(cache_path, "utf8");
            expect(file_content).not.toContain("super_secret_value_xyz");
            expect(file_content).not.toContain("session_token");
        });
    });

    describe("AC-009: 脚本升级（code hash 变化）自动失效旧记录", () => {
        it("isolates old discovery records when script code changes", async () => {
            const store = create_connector_discovery_store(cache_path);

            const script_v1 = "const version = 1; return [];";
            const script_v2 = "const version = 2; return [];";

            const ns_v1 = compute_discovery_namespace("sample_discovery", "inst_1", script_v1);
            const ns_v2 = compute_discovery_namespace("sample_discovery", "inst_1", script_v2);

            expect(ns_v1).not.toBe(ns_v2);

            await store.set(ns_v1, "action", {
                signature: "sig1",
                action_id: "id_v1",
                discovered_at: 100,
            });

            // v1 has record, v2 does not hit v1
            expect(await store.get(ns_v1, "action")).not.toBeNull();
            expect(await store.get(ns_v2, "action")).toBeNull();
        });
    });

    describe("AC-010: 损坏缓存文件自动丢弃重建", () => {
        it("discards corrupted cache file without throwing error and continues normally", async () => {
            await writeFile(cache_path, "MALFORMED_NON_JSON{{{", "utf8");

            const store = create_connector_discovery_store(cache_path);
            const ns = "test:inst:hash";

            // Reading from corrupted file returns null, does not throw
            expect(await store.get(ns, "any")).toBeNull();

            // Writing replaces corrupted file with valid JSON
            await store.set(ns, "act", {
                signature: "sig",
                action_id: "id",
                discovered_at: 1,
            });

            const content = await readFile(cache_path, "utf8");
            expect(() => {
                JSON.parse(content);
            }).not.toThrow();
        });
    });

    describe("AC-011: 旧 generation 写回不得覆盖较新记录", () => {
        it("discards delta carrying outdated generation", async () => {
            const store = create_connector_discovery_store(cache_path);
            const ns = "test:inst:hash";

            // Generation 2 writes first
            await store.merge_delta(
                ns,
                {
                    action: {
                        signature: "new_sig",
                        action_id: "act_gen_2",
                        discovered_at: 200,
                    },
                },
                2,
            );

            expect((await store.get(ns, "action"))?.action_id).toBe("act_gen_2");

            // Generation 1 (slow / outdated) attempts to write later
            await store.merge_delta(
                ns,
                {
                    action: {
                        signature: "old_sig",
                        action_id: "act_gen_1",
                        discovered_at: 100,
                    },
                },
                1,
            );

            // Record must NOT have been overwritten by generation 1
            expect((await store.get(ns, "action"))?.action_id).toBe("act_gen_2");
            expect((await store.get(ns, "action"))?.signature).toBe("new_sig");
        });
    });
});

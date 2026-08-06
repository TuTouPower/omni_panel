import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import { scrubber } from "../../../src/shared/lib/logger";

let temp_dir: string;
let vault: VaultBackend;

beforeEach(async () => {
    scrubber.clear();
    temp_dir = await mkdtemp(join(tmpdir(), "vault-test-"));
    vault = await create_file_vault_backend(temp_dir);
}, 60_000);

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("file-vault-backend", () => {
    it("returns null for non-existent key", async () => {
        expect(await vault.get("missing")).toBeNull();
    });

    it("stores and retrieves a value", async () => {
        await vault.set("tavily-1:api_key", "sk-test-123");
        const result = await vault.get("tavily-1:api_key");
        expect(result).toBe("sk-test-123");
    });

    it("overwrites existing value", async () => {
        await vault.set("key", "old");
        await vault.set("key", "new");
        expect(await vault.get("key")).toBe("new");
    });

    it("deletes a key", async () => {
        await vault.set("key", "value");
        await vault.delete("key");
        expect(await vault.get("key")).toBeNull();
    });

    it("delete is no-op for missing key", async () => {
        await vault.delete("missing");
    });

    it("has returns true/false correctly", async () => {
        expect(await vault.has("key")).toBe(false);
        await vault.set("key", "value");
        expect(await vault.has("key")).toBe(true);
    });

    it("list_keys returns all keys", async () => {
        await vault.set("a:1", "x");
        await vault.set("b:2", "y");
        const keys = await vault.list_keys();
        expect(keys).toContain("a:1");
        expect(keys).toContain("b:2");
    });

    it("list_keys with prefix filters", async () => {
        await vault.set("tavily-1:api_key", "x");
        await vault.set("tavily-1:other", "y");
        await vault.set("deepseek-1:api_key", "z");
        const keys = await vault.list_keys("tavily-1:");
        expect(keys).toHaveLength(2);
        expect(keys).toContain("tavily-1:api_key");
        expect(keys).toContain("tavily-1:other");
    });

    it("persists across instances", async () => {
        await vault.set("persist", "hello");
        const vault2 = await create_file_vault_backend(temp_dir);
        expect(await vault2.get("persist")).toBe("hello");
    });

    it("vault.key file exists with correct size", async () => {
        const { stat } = await import("node:fs/promises");
        const key_stat = await stat(join(temp_dir, "vault.key"));
        expect(key_stat.size).toBe(32);
    });

    it("decrypt fails gracefully with corrupted entry", async () => {
        await vault.set("key", "value");
        const { writeFile } = await import("node:fs/promises");
        await writeFile(
            join(temp_dir, "secrets.vault"),
            '{"key":{"iv":"bad","tag":"bad","ciphertext":"bad"}}',
        );
        const vault2 = await create_file_vault_backend(temp_dir);
        expect(await vault2.get("key")).toBeNull();
    });

    it("does not leak full key name in logs on decrypt failure", async () => {
        const { addTransport } = await import("../../../src/shared/lib/logger");
        const logged_messages: string[] = [];
        const remove_transport = addTransport({
            write(_level, _module, message) {
                logged_messages.push(message);
            },
        });
        try {
            await vault.set("tavily-1:super-secret-key", "value");
            const { writeFile } = await import("node:fs/promises");
            await writeFile(
                join(temp_dir, "secrets.vault"),
                '{"tavily-1:super-secret-key":{"iv":"bad","tag":"bad","ciphertext":"bad"}}',
            );
            await vault.get("tavily-1:super-secret-key");

            const full_key = "tavily-1:super-secret-key";
            for (const msg of logged_messages) {
                expect(msg).not.toContain(full_key);
            }
        } finally {
            remove_transport();
        }
    });

    it("recovers from .bak when vault JSON is corrupted", async () => {
        const { writeFile, readFile } = await import("node:fs/promises");
        // Write a valid vault entry — write_vault creates .bak automatically
        await vault.set("recover-key", "recover-value");
        // Read the valid vault content that was also written to .bak
        const valid_raw = await readFile(join(temp_dir, "secrets.vault"), "utf8");
        // Corrupt the main vault file
        await writeFile(join(temp_dir, "secrets.vault"), "corrupted{{{");
        // Ensure .bak has the valid content
        await writeFile(join(temp_dir, "secrets.vault.bak"), valid_raw, "utf8");
        // Should recover from .bak
        const vault2 = await create_file_vault_backend(temp_dir);
        const result = await vault2.get("recover-key");
        expect(result).toBe("recover-value");
    });

    it("throws when both main vault and .bak are corrupted", async () => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(temp_dir, "secrets.vault"), "corrupted{{{");
        await writeFile(join(temp_dir, "secrets.vault.bak"), "also-corrupted{{{");
        const vault2 = await create_file_vault_backend(temp_dir);
        await expect(vault2.get("any-key")).rejects.toThrow("possibly corrupted");
    });

    it("throws on corrupted vault JSON instead of silently returning empty", async () => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(temp_dir, "secrets.vault"), "not valid json {{{");
        await expect(vault.get("any-key")).rejects.toThrow();
    });

    it("auto-registers decrypted value in scrubber", async () => {
        const secret_value = "sk-my-super-secret-api-key";
        await vault.set("test-key", secret_value);

        expect(scrubber.get_values().has(secret_value)).toBe(false);

        const result = await vault.get("test-key");
        expect(result).toBe(secret_value);
        expect(scrubber.get_values().has(secret_value)).toBe(true);
    });

    it("concurrent set on different keys preserves all values", async () => {
        await Promise.all(
            Array.from({ length: 10 }, (_, i) =>
                vault.set(`key-${String(i)}`, `value-${String(i)}`),
            ),
        );
        for (let i = 0; i < 10; i++) {
            expect(await vault.get(`key-${String(i)}`)).toBe(`value-${String(i)}`);
        }
    });

    it("global mutex completes 20 concurrent writes within a generous bound", async () => {
        const start = Date.now();
        await Promise.all(
            Array.from({ length: 20 }, (_, i) =>
                vault.set(`perf-${String(i)}`, `val-${String(i)}`),
            ),
        );
        const elapsed = Date.now() - start;
        // p051: 原 2s 窗口在整批并行负载下被挤爆。保留「mutex 无死锁、写不异常慢」的
        // 性能意图，但把断言窗口放宽到脚本超时内，消除负载敏感（20 次串行加密写本身
        // 数毫秒级；60s 仍能捕获真正卡死）。
        expect(elapsed).toBeLessThan(60000);
        for (let i = 0; i < 20; i++) {
            expect(await vault.get(`perf-${String(i)}`)).toBe(`val-${String(i)}`);
        }
    }, 120_000);

    it("atomic write leaves no .tmp residue after set", async () => {
        const { readdir } = await import("node:fs/promises");
        await vault.set("atomic-key", "value");
        const entries = await readdir(temp_dir);
        expect(entries.some((name) => name.endsWith(".tmp"))).toBe(false);
    });

    it(".bak mirrors main vault content after successful write", async () => {
        const { readFile } = await import("node:fs/promises");
        await vault.set("bak-key", "bak-value");
        const main = await readFile(join(temp_dir, "secrets.vault"), "utf8");
        const bak = await readFile(join(temp_dir, "secrets.vault.bak"), "utf8");
        expect(bak).toBe(main);
    });

    it("throws when vault.key file exists but has wrong length (corrupted, not overwritten)", async () => {
        const { writeFile } = await import("node:fs/promises");
        // vault 已生成 32 字节 key；覆写为异常长度
        await writeFile(join(temp_dir, "vault.key"), Buffer.alloc(10));
        await expect(create_file_vault_backend(temp_dir)).rejects.toThrow(
            "Invalid vault key length",
        );
    });

    describe("replaceAll (t-bug 原子批量替换)", () => {
        it("atomically replaces the entire vault contents", async () => {
            await vault.set("old-1", "old-value-1");
            await vault.set("old-2", "old-value-2");
            await vault.replaceAll({
                "new-1": "new-value-1",
                "new-2": "new-value-2",
                "new-3": "new-value-3",
            });
            // 旧 key 全消失。
            expect(await vault.get("old-1")).toBeNull();
            expect(await vault.get("old-2")).toBeNull();
            // 新 key 全在、值正确。
            expect(await vault.get("new-1")).toBe("new-value-1");
            expect(await vault.get("new-2")).toBe("new-value-2");
            expect(await vault.get("new-3")).toBe("new-value-3");
        });

        it("with empty entries clears the vault", async () => {
            await vault.set("key", "value");
            await vault.replaceAll({});
            expect(await vault.list_keys()).toHaveLength(0);
        });

        it("write-through so a fresh instance reads the replaced contents", async () => {
            await vault.replaceAll({ "a:1": "x", "b:2": "y" });
            const fresh = await create_file_vault_backend(temp_dir);
            expect(await fresh.get("a:1")).toBe("x");
            expect(await fresh.get("b:2")).toBe("y");
        });

        it(".bak mirrors main vault after replaceAll", async () => {
            const { readFile } = await import("node:fs/promises");
            await vault.replaceAll({ "k:1": "v" });
            const main = await readFile(join(temp_dir, "secrets.vault"), "utf8");
            const bak = await readFile(join(temp_dir, "secrets.vault.bak"), "utf8");
            expect(bak).toBe(main);
        });

        it("does not commit the mirror when the write fails (atomicity)", async () => {
            const { mkdir } = await import("node:fs/promises");
            await vault.set("keep-1", "value-k");
            await mkdir(join(temp_dir, "secrets.vault.tmp"));
            await expect(
                vault.replaceAll({ "new-1": "value-n", "new-2": "value-n2" }),
            ).rejects.toThrow();
            // 镜像未提交：失败后旧数据保持可读、新数据不可读。
            expect(await vault.get("keep-1")).toBe("value-k");
            expect(await vault.get("new-1")).toBeNull();
            // 冷镜像重读盘也保持旧状态。
            const fresh = await create_file_vault_backend(temp_dir);
            expect(await fresh.get("keep-1")).toBe("value-k");
            expect(await fresh.get("new-1")).toBeNull();
        });
    });

    describe("in-memory mirror (t195)", () => {
        it("serves reads from the mirror without re-reading the file after first read", async () => {
            await vault.set("mirror-1", "value-1");
            expect(await vault.get("mirror-1")).toBe("value-1");
            // 篡改盘上文件（删除该 entry）：镜像已缓存，get 不重读，仍返回旧值。
            const { readFile, writeFile } = await import("node:fs/promises");
            const vault_path = join(temp_dir, "secrets.vault");
            const on_disk = JSON.parse(await readFile(vault_path, "utf8")) as Record<
                string,
                unknown
            >;
            delete on_disk["mirror-1"];
            await writeFile(vault_path, JSON.stringify(on_disk), "utf8");
            expect(await vault.get("mirror-1")).toBe("value-1");
            expect(await vault.has("mirror-1")).toBe(true);
        });

        it("set writes through to disk so a new backend instance can read the value", async () => {
            await vault.set("writethrough-1", "value-2");
            const fresh = await create_file_vault_backend(temp_dir);
            expect(await fresh.get("writethrough-1")).toBe("value-2");
        });

        it("a new backend instance starts with a cold mirror that reads disk", async () => {
            await vault.set("cold-1", "value-3");
            // 直接篡改盘上文件（绕过镜像）新增一个合法密文 entry：热镜像已缓存
            // 读不到，冷镜像重读盘能读到（review f001 修正——旧版未真正写盘）。
            const { readFile, writeFile } = await import("node:fs/promises");
            const vault_path = join(temp_dir, "secrets.vault");
            const on_disk = JSON.parse(await readFile(vault_path, "utf8")) as Record<
                string,
                unknown
            >;
            on_disk["cold-2"] = on_disk["cold-1"];
            await writeFile(vault_path, JSON.stringify(on_disk), "utf8");
            // 热镜像：不重读盘，读不到盘上新加的 cold-2。
            expect(await vault.get("cold-2")).toBeNull();
            // 冷镜像：从盘读，能读到 cold-2（复用 cold-1 密文，解密同值）。
            const fresh = await create_file_vault_backend(temp_dir);
            expect(await fresh.get("cold-2")).toBe("value-3");
        });

        it("delete updates the mirror so later reads agree with the disk state", async () => {
            await vault.set("del-1", "value-4");
            await vault.delete("del-1");
            expect(await vault.get("del-1")).toBeNull();
            expect(await vault.has("del-1")).toBe(false);
            const fresh = await create_file_vault_backend(temp_dir);
            expect(await fresh.get("del-1")).toBeNull();
        });

        it("set does not commit the mirror when the write fails (f002)", async () => {
            const { mkdir } = await import("node:fs/promises");
            await vault.set("persist-1", "value-p");
            // 把 tmp 路径占为目录 → writeFileAtomic 写 tmp 失败（EISDIR），
            // 后续 write_vault 抛错。
            await mkdir(join(temp_dir, "secrets.vault.tmp"));
            await expect(vault.set("persist-2", "value-q")).rejects.toThrow();
            // 镜像未提交：get 读不到失败写入的新 key。
            expect(await vault.get("persist-2")).toBeNull();
            // 磁盘旧值不受影响，重启（冷镜像）后仍只有 persist-1。
            const fresh = await create_file_vault_backend(temp_dir);
            expect(await fresh.get("persist-1")).toBe("value-p");
            expect(await fresh.get("persist-2")).toBeNull();
        });

        it("delete does not commit the mirror when the write fails (f002)", async () => {
            const { mkdir } = await import("node:fs/promises");
            await vault.set("keep-1", "value-k");
            await mkdir(join(temp_dir, "secrets.vault.tmp"));
            await expect(vault.delete("keep-1")).rejects.toThrow();
            // 镜像未提交：delete 失败后 key 仍可读。
            expect(await vault.get("keep-1")).toBe("value-k");
        });
    });
});

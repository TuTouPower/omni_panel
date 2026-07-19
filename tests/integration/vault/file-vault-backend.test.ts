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
});

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

    it("global mutex completes 20 concurrent writes within 2 seconds", async () => {
        const start = Date.now();
        await Promise.all(
            Array.from({ length: 20 }, (_, i) =>
                vault.set(`perf-${String(i)}`, `val-${String(i)}`),
            ),
        );
        const elapsed = Date.now() - start;
        expect(elapsed).toBeLessThan(2000);
        for (let i = 0; i < 20; i++) {
            expect(await vault.get(`perf-${String(i)}`)).toBe(`val-${String(i)}`);
        }
    });

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
});

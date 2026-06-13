import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";

let temp_dir: string;
let vault: VaultBackend;

beforeEach(async () => {
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

    it("throws on corrupted vault JSON instead of silently returning empty", async () => {
        const { writeFile } = await import("node:fs/promises");
        await writeFile(join(temp_dir, "secrets.vault"), "not valid json {{{");
        await expect(vault.get("any-key")).rejects.toThrow();
    });
});

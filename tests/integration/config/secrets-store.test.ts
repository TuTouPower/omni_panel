import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSecretsStore } from "../../../src/main/core/config/secrets-store";
import { create_file_vault_backend } from "../../../src/main/core/vault/file-vault-backend";

let tempDir: string;

async function create_store(dir = tempDir) {
    const vault = await create_file_vault_backend(dir);
    return createSecretsStore(vault);
}

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "secrets-test-"));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

describe("secrets-store", () => {
    it("returns null for non-existent key", async () => {
        const store = await create_store();
        expect(await store.get("missing")).toBeNull();
    });

    it("saves and retrieves secret", async () => {
        const store = await create_store();
        await store.set("api_key", "sk-123");
        expect(await store.get("api_key")).toBe("sk-123");
    });

    it("deletes secret", async () => {
        const store = await create_store();
        await store.set("key", "val");
        await store.delete("key");
        expect(await store.get("key")).toBeNull();
    });

    it("sets key file permissions to 0600", async () => {
        if (process.platform === "win32") return;
        const store = await create_store();
        await store.set("api_key", "sk-123");
        const fileStat = await stat(join(tempDir, "vault.key"));
        const mode = (fileStat.mode & 0o777).toString(8);
        expect(mode).toBe("600");
    });

    it("does not write raw secret to disk", async () => {
        const store = await create_store();
        await store.set("api_key", "sk-raw-secret");
        const diskContent = await readFile(join(tempDir, "secrets.vault"), "utf8");
        expect(diskContent).not.toContain("sk-raw-secret");
    });

    it("returns null when stored ciphertext cannot be decrypted", async () => {
        const store = await create_store();
        await store.set("api_key", "sk-123");
        await writeFile(join(tempDir, "secrets.vault"), JSON.stringify({ api_key: "broken" }));

        expect(await store.get("api_key")).toBeNull();
    });

    it("exportAll returns all secrets decrypted", async () => {
        const store = await create_store();
        await store.set("key1", "val1");
        await store.set("key2", "val2");

        const exported = await store.exportAll();
        expect(exported).toEqual({ key1: "val1", key2: "val2" });
    });

    it("exportAll returns empty object when no secrets", async () => {
        const store = await create_store();
        expect(await store.exportAll()).toEqual({});
    });

    it("importAll replaces all secrets with encrypted values", async () => {
        const store = await create_store();
        await store.set("old-key", "old-val");

        await store.importAll({ newKey1: "newVal1", newKey2: "newVal2" });

        expect(await store.get("old-key")).toBeNull();
        expect(await store.get("newKey1")).toBe("newVal1");
        expect(await store.get("newKey2")).toBe("newVal2");

        const diskContent = await readFile(join(tempDir, "secrets.vault"), "utf8");
        expect(diskContent).not.toContain("newVal1");
    });

    it("exportAll → importAll roundtrip preserves data", async () => {
        const store = await create_store();
        await store.set("a:b", "secret-a");
        await store.set("c:d", "secret-b");

        const exported = await store.exportAll();
        const store2 = await create_store(join(tempDir, "second"));
        await store2.importAll(exported);

        expect(await store2.get("a:b")).toBe("secret-a");
        expect(await store2.get("c:d")).toBe("secret-b");
    });
});

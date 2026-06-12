import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSecretsStore } from "../../../src/main/core/config/secrets-store";
import type { CryptoBackend } from "../../../src/main/core/config/crypto-backend";

let tempDir: string;

const testCrypto: CryptoBackend = {
    encrypt(plaintext: string): string {
        return Buffer.from(plaintext, "utf8").toString("base64");
    },
    decrypt(ciphertext: string): string {
        return Buffer.from(ciphertext, "base64").toString("utf8");
    },
};

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "secrets-test-"));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

describe("secrets-store", () => {
    it("returns null for non-existent key", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
        expect(await store.get("missing")).toBeNull();
    });

    it("saves and retrieves secret", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
        await store.set("api_key", "sk-123");
        expect(await store.get("api_key")).toBe("sk-123");
    });

    it("deletes secret", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
        await store.set("key", "val");
        await store.delete("key");
        expect(await store.get("key")).toBeNull();
    });

    it("sets file permissions to 0600", async () => {
        // chmod 0600 is a Unix concept, skipped on Windows
        if (process.platform === "win32") {
            return;
        }
        const filePath = join(tempDir, "secrets.json");
        const store = createSecretsStore(filePath, testCrypto);
        await store.set("api_key", "sk-123");
        const fileStat = await stat(filePath);
        const mode = (fileStat.mode & 0o777).toString(8);
        expect(mode).toBe("600");
    });

    it("does not write raw secret to disk", async () => {
        const filePath = join(tempDir, "secrets.json");
        const store = createSecretsStore(filePath, testCrypto);
        await store.set("api_key", "sk-raw-secret");
        const diskContent = await readFile(filePath, "utf8");
        expect(diskContent).not.toContain("sk-raw-secret");
        expect(diskContent).toContain(Buffer.from("sk-raw-secret", "utf8").toString("base64"));
    });

    it("encrypts values through crypto backend", async () => {
        const encryptCalls: string[] = [];
        const trackingCrypto: CryptoBackend = {
            encrypt(plaintext: string): string {
                encryptCalls.push(plaintext);
                return testCrypto.encrypt(plaintext);
            },
            decrypt(ciphertext: string): string {
                return testCrypto.decrypt(ciphertext);
            },
        };

        const store = createSecretsStore(join(tempDir, "secrets.json"), trackingCrypto);
        await store.set("token", "my-secret-token");
        expect(encryptCalls).toEqual(["my-secret-token"]);
    });

    it("returns null when stored ciphertext cannot be decrypted", async () => {
        const filePath = join(tempDir, "secrets.json");
        const store = createSecretsStore(filePath, {
            encrypt(plaintext: string) {
                return testCrypto.encrypt(plaintext);
            },
            decrypt() {
                throw new Error("bad ciphertext");
            },
        });
        await writeFile(filePath, JSON.stringify({ api_key: "broken" }));

        expect(await store.get("api_key")).toBeNull();
    });

    it("exportAll returns all secrets decrypted", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
        await store.set("key1", "val1");
        await store.set("key2", "val2");

        const exported = await store.exportAll();
        expect(exported).toEqual({ key1: "val1", key2: "val2" });
    });

    it("exportAll returns empty object when no secrets", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
        expect(await store.exportAll()).toEqual({});
    });

    it("importAll replaces all secrets with encrypted values", async () => {
        const filePath = join(tempDir, "secrets.json");
        const store = createSecretsStore(filePath, testCrypto);
        await store.set("old-key", "old-val");

        await store.importAll({ newKey1: "newVal1", newKey2: "newVal2" });

        expect(await store.get("old-key")).toBeNull();
        expect(await store.get("newKey1")).toBe("newVal1");
        expect(await store.get("newKey2")).toBe("newVal2");

        const diskContent = await readFile(filePath, "utf8");
        expect(diskContent).not.toContain("newVal1");
    });

    it("exportAll → importAll roundtrip preserves data", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
        await store.set("a:b", "secret-a");
        await store.set("c:d", "secret-b");

        const exported = await store.exportAll();

        const store2 = createSecretsStore(join(tempDir, "secrets2.json"), testCrypto);
        await store2.importAll(exported);

        expect(await store2.get("a:b")).toBe("secret-a");
        expect(await store2.get("c:d")).toBe("secret-b");
    });

    it("propagates encrypt failure from set()", async () => {
        const failingCrypto: CryptoBackend = {
            encrypt() {
                throw new Error("keychain locked");
            },
            decrypt(ciphertext: string): string {
                return testCrypto.decrypt(ciphertext);
            },
        };
        const store = createSecretsStore(join(tempDir, "secrets.json"), failingCrypto);
        await expect(store.set("api_key", "sk-123")).rejects.toThrow("keychain locked");
    });

    it("logs raw secret values only in development", async () => {
        const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
        const original_node_env = process.env["NODE_ENV"];
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            process.env["NODE_ENV"] = "development";
            const store = createSecretsStore(join(tempDir, "secrets.json"), testCrypto);
            await store.set("instance:api_secret", "raw-secret-value");
            await store.get("instance:api_secret");
            await store.exportAll();
            await store.importAll({ "instance:api_secret": "raw-secret-value" });
            await store.delete("instance:api_secret");

            let joined = lines.join("\n");
            expect(joined).toContain("secret set raw");
            expect(joined).toContain("secret get raw");
            expect(joined).toContain("secret export raw");
            expect(joined).toContain("secret import raw");
            expect(joined).toContain("secret delete raw");
            expect(joined).toContain("raw-secret-value");
            const deleteLine = lines.find((line) => line.includes("secret delete raw")) ?? "";
            expect(deleteLine).toContain('"value":"raw-secret-value"');

            lines.length = 0;
            process.env["NODE_ENV"] = "production";
            await store.set("instance:api_secret", "raw-secret-value");
            await store.get("instance:api_secret");
            await store.exportAll();

            joined = lines.join("\n");
            expect(joined).not.toContain("secret set raw");
            expect(joined).not.toContain("secret get raw");
            expect(joined).not.toContain("secret export raw");
            expect(joined).not.toContain("raw-secret-value");
        } finally {
            if (original_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = original_node_env;
            }
            remove_transport();
        }
    });
});

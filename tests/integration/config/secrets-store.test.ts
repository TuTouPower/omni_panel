import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
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
});

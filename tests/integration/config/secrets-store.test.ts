import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createSecretsStore } from "../../../src/main/core/config/secrets-store";

let tempDir: string;

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "secrets-test-"));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

describe("secrets-store", () => {
    it("returns null for non-existent key", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"));
        expect(await store.get("missing")).toBeNull();
    });

    it("saves and retrieves secret", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"));
        await store.set("api_key", "sk-123");
        expect(await store.get("api_key")).toBe("sk-123");
    });

    it("deletes secret", async () => {
        const store = createSecretsStore(join(tempDir, "secrets.json"));
        await store.set("key", "val");
        await store.delete("key");
        expect(await store.get("key")).toBeNull();
    });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createCacheStore } from "../../../src/main/core/cache/cache-store";

let tempDir: string;

beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "cache-store-test-"));
});

afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
});

describe("cache-store", () => {
    it("returns null for non-existent stateId", async () => {
        const store = createCacheStore(tempDir);
        const result = await store.load("nonexistent");
        expect(result).toBeNull();
    });

    it("saves and loads cache", async () => {
        const store = createCacheStore(tempDir);
        const state = {
            updatedAt: "2026-05-24T12:00:00Z",
            items: [
                {
                    id: "a",
                    name: "A",
                    used: 10,
                    limit: 100,
                    displayStyle: "percent" as const,
                    status: "normal" as const,
                },
            ],
        };
        await store.save("test-id", state);
        const loaded = await store.load("test-id");
        expect(loaded?.updatedAt).toBe("2026-05-24T12:00:00Z");
        expect(loaded?.items).toHaveLength(1);
    });

    it("deletes cache", async () => {
        const store = createCacheStore(tempDir);
        await store.save("del-me", { updatedAt: "2026-05-24T12:00:00Z", items: [] });
        await store.delete("del-me");
        expect(await store.load("del-me")).toBeNull();
    });

    it("does not throw when deleting non-existent cache", async () => {
        const store = createCacheStore(tempDir);
        await store.delete("nonexistent");
    });
});

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
                    provider: "claude" as const,
                    source: "api_key" as const,
                    sourceInstanceId: "test-id",
                    accountId: "test-id",
                    accountLabel: "Claude",
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

    it("rejects stateId with path traversal", async () => {
        const store = createCacheStore(tempDir);
        await expect(store.load("../escape")).rejects.toThrow("Invalid stateId");
    });

    it("rejects stateId with slash", async () => {
        const store = createCacheStore(tempDir);
        await expect(store.save("a/b", { updatedAt: "", items: [] })).rejects.toThrow(
            "Invalid stateId",
        );
    });

    it("logs raw cache save and load payloads only in development", async () => {
        const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
        const original_node_env = process.env.NODE_ENV;
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            process.env.NODE_ENV = "development";
            const store = createCacheStore(tempDir);
            const state = {
                updatedAt: "2026-05-24T12:00:00Z",
                items: [
                    {
                        id: "a",
                        provider: "claude" as const,
                        source: "api_key" as const,
                        sourceInstanceId: "test-id",
                        accountId: "test-id",
                        accountLabel: "Claude",
                        name: "5小时用量",
                        used: 10,
                        limit: 100,
                        displayStyle: "percent" as const,
                        resetAt: "2026-05-24T14:00:00Z",
                        status: "normal" as const,
                    },
                ],
            };
            await store.save("test-id", state);
            await store.load("test-id");
            await store.load("missing-id");
            await store.delete("test-id");

            let joined = lines.join("\n");
            expect(joined).toContain("cache save raw");
            expect(joined).toContain("cache load raw");
            expect(joined).toContain("cache load missing raw");
            expect(joined).toContain("cache delete raw");
            expect(joined).toContain("2026-05-24T14:00:00Z");

            lines.length = 0;
            process.env.NODE_ENV = "production";
            await store.save("test-id", state);
            await store.load("test-id");

            joined = lines.join("\n");
            expect(joined).not.toContain("cache save raw");
            expect(joined).not.toContain("cache load raw");
            expect(joined).not.toContain("2026-05-24T14:00:00Z");
        } finally {
            if (original_node_env === undefined) {
                delete process.env.NODE_ENV;
            } else {
                process.env.NODE_ENV = original_node_env;
            }
            remove_transport();
        }
    });
});

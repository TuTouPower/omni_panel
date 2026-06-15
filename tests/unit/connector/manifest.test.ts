import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { load_manifest } from "../../../src/main/core/connector/manifest-loader";

let temp_dir: string;

beforeEach(async () => {
    temp_dir = await mkdtemp(join(tmpdir(), "manifest-test-"));
});

afterEach(async () => {
    await rm(temp_dir, { recursive: true, force: true });
});

describe("manifest-loader", () => {
    it("loads valid poll manifest", async () => {
        const manifest = {
            id: "tavily",
            provider: "tavily",
            capabilities: ["poll"],
            parameters: [{ name: "api_key", type: "secret", required: true }],
            endpoints: { default: "https://api.tavily.com" },
            poll: {
                request: {
                    endpoint: "default",
                    path: "/usage",
                    auth: { type: "bearer", secret: "api_key" },
                },
                map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
            },
        };
        await writeFile(join(temp_dir, "manifest.json"), JSON.stringify(manifest));
        const result = await load_manifest(temp_dir);
        expect(result).not.toBeNull();
        expect(result?.id).toBe("tavily");
        expect(result?.capabilities).toContain("poll");
    });

    it("returns null for missing manifest.json", async () => {
        const result = await load_manifest(temp_dir);
        expect(result).toBeNull();
    });

    it("returns null for invalid JSON", async () => {
        await writeFile(join(temp_dir, "manifest.json"), "not json");
        const result = await load_manifest(temp_dir);
        expect(result).toBeNull();
    });

    it("returns null when capability config is missing", async () => {
        const manifest = {
            id: "bad",
            provider: "bad",
            capabilities: ["poll"],
        };
        await writeFile(join(temp_dir, "manifest.json"), JSON.stringify(manifest));
        const result = await load_manifest(temp_dir);
        expect(result).toBeNull();
    });

    it("loads observe manifest", async () => {
        const manifest = {
            id: "brave_search",
            provider: "brave",
            capabilities: ["observe"],
            endpoints: { default: "https://api.search.brave.com" },
            observe: {
                headers: ["X-RateLimit-Limit", "X-RateLimit-Remaining"],
                probe: {
                    endpoint: "default",
                    path: "/res/v1/web/search",
                    params: { q: "test", count: "1" },
                },
            },
        };
        await writeFile(join(temp_dir, "manifest.json"), JSON.stringify(manifest));
        const result = await load_manifest(temp_dir);
        expect(result).not.toBeNull();
        expect(result?.observe?.headers).toHaveLength(2);
    });

    it("keeps brave manifest limit default in sync with connector default", async () => {
        const manifest_path = join(process.cwd(), "connectors", "brave", "manifest.json");
        const connector_path = join(process.cwd(), "connectors", "brave", "connector.ts");
        const manifest = JSON.parse(await readFile(manifest_path, "utf8")) as {
            parameters?: { name?: string; default?: string }[];
        };
        const connector_source = await readFile(connector_path, "utf8");
        const default_limit_match = /const DEFAULT_LIMIT = (\d+);/.exec(connector_source);

        expect(default_limit_match?.[1]).toBeDefined();

        const limit_parameter = manifest.parameters?.find(
            (parameter) => parameter.name === "LIMIT",
        );

        expect(limit_parameter?.default).toBe(default_limit_match?.[1]);
    });
});

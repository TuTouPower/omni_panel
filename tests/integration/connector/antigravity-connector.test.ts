import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import { manifest_schema } from "../../../src/shared/schemas/manifest";

const manifest_path = join("connectors", "antigravity", "manifest.json");

function create_ctx(): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: () => Promise.resolve({}),
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: {},
        report_failed_account: () => undefined,
    };
}

describe("antigravity connector", () => {
    it("manifest passes schema validation", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as unknown;
        const result = manifest_schema.safeParse(raw);
        expect(result.success).toBe(true);
    });

    it("manifest declares provider as antigravity", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.provider).toBe("antigravity");
    });

    it("manifest declares local capability", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.capabilities).toContain("local");
    });

    it("connector script loads and returns empty observations (stub)", async () => {
        const script = await readFile(join("connectors", "antigravity", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const result = await run_connector(raw, script, create_ctx());
        expect(result.observations).toEqual([]);
        expect(result.error).toBeNull();
    });
});

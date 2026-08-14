import { readFile } from "node:fs/promises";
import { ctx_status } from "./_ctx_status";
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
        status: ctx_status,
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

    it("connector script is a stub and reports not-supported instead of silent empty (t362 AC-002)", async () => {
        const script = await readFile(join("connectors", "antigravity", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const result = await run_connector(raw, script, create_ctx());
        // 占位 stub 明确报「暂不支持」，不静默空数据误导为可用。
        expect(result.error).not.toBeNull();
        expect(result.error).toContain("暂不支持");
        expect(result.observations).toEqual([]);
    });
});

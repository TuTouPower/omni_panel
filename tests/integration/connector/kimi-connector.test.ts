import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import { manifest_schema } from "../../../src/shared/schemas/manifest";

const manifest_path = join("connectors", "kimi", "manifest.json");

function create_ctx(): ConnectorContext {
    return {
        log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        http: {
            get_json: () => Promise.resolve({}),
            post_json: () => Promise.resolve({}),
            get_raw: () => Promise.resolve({ status: 200, headers: {}, body: "" }),
        },
        files: { read: () => Promise.resolve(""), list: () => Promise.resolve([]) },
        params: { SESSION_COOKIE: "test-cookie" },
        report_failed_account: () => undefined,
    };
}

describe("kimi connector", () => {
    it("manifest passes schema validation", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as unknown;
        const result = manifest_schema.safeParse(raw);
        expect(result.success).toBe(true);
    });

    it("manifest declares provider as kimi", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.provider).toBe("kimi");
    });

    it("manifest declares session capability", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.capabilities).toContain("session");
    });

    it("manifest declares SESSION_COOKIE parameter", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const session_param = raw.parameters.find((p) => p.name === "SESSION_COOKIE");
        expect(session_param).toBeDefined();
        expect(session_param?.type).toBe("secret");
        expect(session_param?.required).toBe(true);
    });

    it("manifest declares loginDomains", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.loginDomains).toContain("kimi.com");
    });

    it("manifest declares cookieNames", async () => {
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        expect(raw.cookieNames).toContain("access_token");
        expect(raw.cookieNames).toContain("refresh_token");
    });

    it("connector script loads and returns empty observations (stub)", async () => {
        const script = await readFile(join("connectors", "kimi", "connector.ts"), "utf8");
        const raw = JSON.parse(await readFile(manifest_path, "utf8")) as Manifest;
        const result = await run_connector(raw, script, create_ctx());
        expect(result.observations).toEqual([]);
        expect(result.error).toBeNull();
    });
});

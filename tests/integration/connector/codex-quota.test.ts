import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { run_connector } from "../../../src/main/core/connector/runtime";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";
import { ctx_status } from "./_ctx_status";

describe("codex quota connector", () => {
    it("reads ~/.codex/auth.json and fetches wham/usage quota", async () => {
        const manifest = JSON.parse(
            await readFile(join("connectors", "codex", "manifest.json"), "utf8"),
        ) as Manifest;
        const script = await readFile(join("connectors", "codex", "connector.ts"), "utf8");

        const auth_json = JSON.stringify({
            auth_mode: "chatgpt",
            tokens: {
                access_token: "sk-test-token",
                account_id: "acct-test-id",
                id_token: "h.eyJlbWFpbCI6ICJ1c2VyQGV4YW1wbGUuY29tIn0=.s",
            },
        });

        const usage_response = {
            rate_limit: {
                primary_window: {
                    used_percent: 25,
                    limit_window_seconds: 18000,
                    reset_at: 1773750000,
                },
                secondary_window: {
                    used_percent: 60,
                    limit_window_seconds: 604800,
                    reset_at: 1774300000,
                },
            },
        };

        const get_json = vi
            .fn()
            .mockImplementation(
                (endpoint: string, path: string, opts?: { headers?: Record<string, string> }) => {
                    if (endpoint === "chatgpt" && path === "/backend-api/wham/usage") {
                        expect(opts?.headers?.["Authorization"]).toBe("Bearer sk-test-token");
                        expect(opts?.headers?.["ChatGPT-Account-Id"]).toBe("acct-test-id");
                        return Promise.resolve(usage_response);
                    }
                    return Promise.reject(new Error(`Unknown endpoint ${endpoint}${path}`));
                },
            );

        const ctx: ConnectorContext = {
            log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
            http: {
                get_json,
                post_json: vi.fn(),
                get_raw: vi.fn(),
            },
            files: {
                list: () => Promise.resolve([]),
                read: (path: string) => {
                    if (path === "~/.codex/auth.json") return Promise.resolve(auth_json);
                    return Promise.reject(new Error(`ENOENT: ${path}`));
                },
            },
            params: {},
            status: ctx_status,
            report_failed_account: vi.fn(),
        };

        const result = await run_connector(manifest, script, ctx);
        expect(result.error).toBeNull();
        expect(result.observations.length).toBeGreaterThanOrEqual(2);

        const primary = result.observations.find((o) => o.metric_id.includes("primary"));
        expect(primary).toBeDefined();
        expect(primary?.provider).toBe("codex");
        expect(primary?.used).toBe(25);
        expect(primary?.limit).toBe(100);
        expect(primary?.display_style).toBe("percent");
        expect(primary?.reset_at).toBe(1773750000 * 1000);

        const secondary = result.observations.find((o) => o.metric_id.includes("secondary"));
        expect(secondary).toBeDefined();
        expect(secondary?.provider).toBe("codex");
        expect(secondary?.used).toBe(60);
        expect(secondary?.limit).toBe(100);
        expect(secondary?.display_style).toBe("percent");
    });
});

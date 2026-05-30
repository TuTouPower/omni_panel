import { describe, it, expect } from "vitest";
import { runWithStubBackend } from "./_helpers/with_stub_backend";
import type { HttpStubRoute } from "./_helpers/http_stub";

const PLUGIN = "cpa-usage-plugin.ts";

function claude_auth_files(): unknown {
    return {
        files: [
            {
                name: "auth-11111111-user@example.com-pro.json",
                provider: "claude",
                auth_index: "claude-auth",
            },
            {
                name: "auth-disabled@example.com.json",
                provider: "codex",
                auth_index: "codex-auth",
                disabled: true,
            },
        ],
    };
}

function claude_api_call_response(): unknown {
    return {
        status_code: 200,
        body: {
            five_hour: {
                utilization: 0.25,
                resets_at: "2026-05-26T20:00:00Z",
            },
            seven_day: {
                utilization: 0.5,
                resets_at: "2026-05-27T00:00:00Z",
            },
        },
    };
}

describe("CPA plugin subprocess", () => {
    it("returns error when CPA-Manager is unreachable", async () => {
        const { parsed } = await runWithStubBackend({
            pluginFile: PLUGIN,
            params: { cpa_mgmt_key: "test-key" },
            routes: [],
            env: { OMNI_PLUGIN_ENDPOINTS: JSON.stringify({ default: "http://127.0.0.1:1" }) },
        });

        expect(parsed.success).toBe(false);
    });

    it("fetches Claude quota through CPA-Manager", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/v0/management/auth-files", body: claude_auth_files() },
            { path: "/v0/management/api-call", body: claude_api_call_response() },
        ];

        const { parsed, requests } = await runWithStubBackend({
            pluginFile: PLUGIN,
            params: {
                cpa_mgmt_key: "secret-management-key",
                monitor_claude: "true",
            },
            endpointKey: "default",
            routes,
        });

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;

        expect(parsed.items).toEqual([
            expect.objectContaining({
                id: "claude:user@example.com:5小时",
                name: "Claude (user@example.com) · 5小时",
                used: 25,
                limit: 100,
                displayStyle: "percent",
                status: "normal",
                color: "blue",
            }),
            expect.objectContaining({
                id: "claude:user@example.com:每周",
                name: "Claude (user@example.com) · 每周",
                used: 50,
                limit: 100,
                displayStyle: "percent",
                status: "normal",
                color: "blue",
            }),
        ]);

        expect(requests.map((r) => r.url)).toEqual([
            "/v0/management/auth-files",
            "/v0/management/api-call",
        ]);
        expect(
            requests.every((r) => r.headers.authorization === "Bearer secret-management-key"),
        ).toBe(true);
    });

    it("does not call provider API when provider monitoring is disabled", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/v0/management/auth-files", body: claude_auth_files() },
            { path: "/v0/management/api-call", body: claude_api_call_response() },
        ];

        const { parsed, requests } = await runWithStubBackend({
            pluginFile: PLUGIN,
            params: {
                cpa_mgmt_key: "secret-management-key",
                monitor_claude: "false",
            },
            endpointKey: "default",
            routes,
        });

        expect(parsed.success).toBe(true);
        if (!parsed.success) return;

        expect(parsed.items).toEqual([]);
        expect(requests.map((r) => r.url)).toEqual(["/v0/management/auth-files"]);
    });

    it("returns MISSING_ENDPOINT when cpa_mgmt_key is missing", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/v0/management/auth-files", body: claude_auth_files() },
        ];

        const { parsed } = await runWithStubBackend({
            pluginFile: PLUGIN,
            params: {},
            endpointKey: "default",
            routes,
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(parsed.error.code).toBe("MISSING_ENDPOINT");
    });

    it("returns HTTP_401 when auth-files endpoint returns 401", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/v0/management/auth-files", status: 401, body: { error: "unauthorized" } },
        ];

        const { parsed } = await runWithStubBackend({
            pluginFile: PLUGIN,
            params: { cpa_mgmt_key: "bad-key" },
            endpointKey: "default",
            routes,
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        expect(parsed.error.code).toBe("HTTP_401");
    });

    it("returns NETWORK_ERROR when api-call endpoint returns 500", async () => {
        const routes: HttpStubRoute[] = [
            { path: "/v0/management/auth-files", body: claude_auth_files() },
            { path: "/v0/management/api-call", status: 500, body: { error: "internal" } },
        ];

        const { parsed } = await runWithStubBackend({
            pluginFile: PLUGIN,
            params: { cpa_mgmt_key: "test-key", monitor_claude: "true" },
            endpointKey: "default",
            routes,
        });

        expect(parsed.success).toBe(false);
        if (parsed.success) return;

        // The 500 error is caught by Promise.allSettled, then aggregated
        // into warnings which maps to failFromHttp({ kind: "network" })
        expect(parsed.error.code).toBe("NETWORK_ERROR");
    });
});

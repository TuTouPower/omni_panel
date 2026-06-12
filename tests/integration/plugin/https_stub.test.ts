import { describe, it, expect } from "vitest";
import { withHttpsStub } from "./_helpers/https_stub";
import type { HttpsStubRoute } from "./_helpers/https_stub";
import { runBundledPlugin } from "./_helpers/plugin_test_harness";
import type { PluginRunResult } from "./_helpers/plugin_test_harness";
import type { RecordedRequest } from "./_helpers/https_stub";

const STUB_BALANCE_DATA = {
    balance_infos: [{ currency: "CNY", total_balance: "100.00" }],
};

const PLUGIN_PARAMS = { API_KEY: "sk-test" };
const PLUGIN_ENV = { OMNI_SOURCE_INSTANCE_ID: "https-test" };

type HttpsBackendResult = PluginRunResult & { readonly requests: RecordedRequest[] };

async function runWithHttpsBackend(opts: {
    routes: HttpsStubRoute[];
    gzip?: boolean;
    redirect?: { from: string; to: string; status: 301 | 302 | 307 };
    errorStatus?: number;
    errorBody?: string;
    timeoutMs?: number;
}): Promise<HttpsBackendResult> {
    return withHttpsStub<HttpsBackendResult>(
        {
            routes: opts.routes,
            ...(opts.gzip !== undefined ? { gzip: opts.gzip } : {}),
            ...(opts.redirect !== undefined ? { redirect: opts.redirect } : {}),
            ...(opts.errorStatus !== undefined ? { errorStatus: opts.errorStatus } : {}),
            ...(opts.errorBody !== undefined ? { errorBody: opts.errorBody } : {}),
        },
        async (handle) => {
            const env: Record<string, string> = {
                OMNI_PLUGIN_ENDPOINTS: JSON.stringify({ default: handle.baseUrl }),
                NODE_EXTRA_CA_CERTS: handle.certPath,
                ...PLUGIN_ENV,
            };
            const result = await runBundledPlugin({
                pluginFile: "deepseek-usage-plugin.ts",
                params: PLUGIN_PARAMS,
                env,
                ...(opts.timeoutMs !== undefined ? { timeoutMs: opts.timeoutMs } : {}),
            });
            return { ...result, requests: handle.requests };
        },
    );
}

describe("HTTPS stub plugin coverage", () => {
    it("plugin connects via TLS with self-signed cert", async () => {
        const { parsed, requests } = await runWithHttpsBackend({
            routes: [{ path: "/user/balance", body: STUB_BALANCE_DATA }],
        });
        expect(parsed.success).toBe(true);
        if (parsed.success) {
            expect(parsed.items.length).toBeGreaterThan(0);
            expect(parsed.items[0]).toEqual(
                expect.objectContaining({ provider: "deepseek", source: "api_key" }),
            );
        }
        expect(requests.length).toBe(1);
        expect(requests[0]?.url).toContain("/user/balance");
    });

    it("plugin returns INVALID_RESPONSE for 301 redirect (undici does not follow)", async () => {
        const { parsed } = await runWithHttpsBackend({
            routes: [{ path: "/user/balance", body: STUB_BALANCE_DATA }],
            redirect: { from: "/user/balance", to: "/new-path", status: 301 },
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.code).toBe("INVALID_RESPONSE");
        }
    });

    it("plugin returns INVALID_RESPONSE for gzip response (undici does not decompress)", async () => {
        const { parsed } = await runWithHttpsBackend({
            routes: [{ path: "/user/balance", body: STUB_BALANCE_DATA }],
            gzip: true,
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.code).toBe("INVALID_RESPONSE");
        }
    });

    it("plugin returns INVALID_RESPONSE for non-JSON HTML error", async () => {
        const { parsed } = await runWithHttpsBackend({
            routes: [{ path: "/user/balance", body: STUB_BALANCE_DATA }],
            errorStatus: 502,
            errorBody: "<html><body><h1>502 Bad Gateway</h1></body></html>",
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            // HTML body cannot be JSON-parsed, so http-client returns invalid_json (not http)
            expect(parsed.error.code).toBe("INVALID_RESPONSE");
        }
    });

    it("plugin returns TIMEOUT for slow response", { timeout: 25_000 }, async () => {
        const { parsed } = await runWithHttpsBackend({
            routes: [{ path: "/user/balance", delayMs: 20_000, body: {} }],
            timeoutMs: 20_000,
        });
        expect(parsed.success).toBe(false);
        if (!parsed.success) {
            expect(parsed.error.code).toBe("TIMEOUT");
        }
    });
});

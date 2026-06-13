import { describe, expect, it } from "vitest";
import { execute_poll } from "../../../src/main/core/connector/tier1-poll-executor";
import type { ConnectorContext } from "../../../src/main/core/connector/host-io";
import type { Manifest } from "../../../src/shared/schemas/manifest";

const tavily_manifest: Manifest = {
    id: "tavily",
    provider: "tavily",
    capabilities: ["poll"],
    parameters: [],
    endpoints: { default: "https://api.tavily.com" },
    poll: {
        request: {
            endpoint: "default",
            path: "/usage",
            method: "GET",
            auth: { type: "bearer", secret: "api_key" },
        },
        map: { used: "$.usage.month", limit: "$.plan.limit", window: "month" },
    },
};

function make_ctx(response: unknown): ConnectorContext {
    return {
        http: {
            get_json() {
                return Promise.resolve(response);
            },
            post_json() {
                return Promise.resolve(response);
            },
        },
        files: {
            read() {
                return Promise.resolve("");
            },
        },
        params: {},
    };
}

describe("tier1-poll-executor", () => {
    it("returns observation from poll response", async () => {
        const ctx = make_ctx({ usage: { month: 100 }, plan: { limit: 1000 } });
        const result = await execute_poll(tavily_manifest, "tavily-1", ctx);
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
            provider: "tavily",
            source_instance_id: "tavily-1",
            account_id: "default",
            account_label: "tavily",
            metric_id: "tavily:usage",
            name: "Usage",
            window: "month",
            used: 100,
            limit: 1000,
            display_style: "ratio",
            reset_at: null,
            status: "normal",
            source: "poll",
            stale: false,
            last_error: null,
        });
        expect(result[0]?.observed_at).toEqual(expect.any(Number));
    });

    it("uses POST when manifest request method is POST", async () => {
        let posted_body: unknown;
        const manifest: Manifest = {
            ...tavily_manifest,
            poll: {
                ...tavily_manifest.poll,
                request: {
                    endpoint: "default",
                    path: "/usage",
                    method: "POST",
                    body: { range: "month" },
                },
                map: { used: "$.used", limit: "$.limit", window: "$.window" },
            },
        };
        const ctx: ConnectorContext = {
            http: {
                get_json() {
                    return Promise.reject(new Error("unexpected GET"));
                },
                post_json(_endpoint_key, _path, body) {
                    posted_body = body;
                    return Promise.resolve({ used: 5, limit: 10, window: "day" });
                },
            },
            files: {
                read() {
                    return Promise.resolve("");
                },
            },
            params: {},
        };

        const result = await execute_poll(manifest, "tavily-1", ctx);
        expect(posted_body).toEqual({ range: "month" });
        expect(result[0]).toMatchObject({ used: 5, limit: 10, window: "day" });
    });

    it("throws on HTTP error instead of silently returning empty", async () => {
        const ctx: ConnectorContext = {
            http: {
                get_json() {
                    return Promise.reject(new Error("network"));
                },
                post_json() {
                    return Promise.reject(new Error("network"));
                },
            },
            files: {
                read() {
                    return Promise.resolve("");
                },
            },
            params: {},
        };
        await expect(execute_poll(tavily_manifest, "tavily-1", ctx)).rejects.toThrow("network");
    });

    it("returns empty array when used and limit are missing", async () => {
        const ctx = make_ctx({ usage: {}, plan: {} });
        const result = await execute_poll(tavily_manifest, "tavily-1", ctx);
        expect(result).toHaveLength(0);
    });

    it("throws when manifest has no poll config", async () => {
        const no_poll = { ...tavily_manifest, poll: undefined };
        await expect(execute_poll(no_poll, "tavily-1", make_ctx({}))).rejects.toThrow(
            "no poll config",
        );
    });
});

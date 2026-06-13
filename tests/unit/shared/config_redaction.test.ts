import { describe, it, expect } from "vitest";
import { redact_config_raw, redact_config_json } from "../../../src/shared/lib/config_redaction";

describe("redact_config_raw", () => {
    it("redacts providerLabelMaps", () => {
        const result = redact_config_raw({ providerLabelMaps: { foo: "bar" } }) as Record<
            string,
            unknown
        >;
        expect(result["providerLabelMaps"]).toBe("[redacted]");
    });

    it("redacts all values under a top-level secrets field", () => {
        const input = {
            instanceId: "claude-1",
            secrets: { API_KEY: "sk-live-123", SESSION_COOKIE: "sess-xyz" },
        };
        const result = redact_config_raw(input) as { secrets: Record<string, unknown> };
        expect(result.secrets["API_KEY"]).toBe("***");
        expect(result.secrets["SESSION_COOKIE"]).toBe("***");
        expect(JSON.stringify(result)).not.toContain("sk-live-123");
        expect(JSON.stringify(result)).not.toContain("sess-xyz");
    });

    it("redacts parameterValues whose name looks like a secret", () => {
        const input = {
            instanceId: "openai-1",
            parameterValues: {
                API_KEY: "sk-secret-abc",
                SESSION_COOKIE: "cookie-abc",
                ACCESS_TOKEN: "tok-abc",
                PASSWORD: "p@ss",
                client_id: "cid-123",
                base_url: "https://api.example.com",
            },
        };
        const result = redact_config_raw(input) as { parameterValues: Record<string, unknown> };
        expect(result.parameterValues["API_KEY"]).toBe("***");
        expect(result.parameterValues["SESSION_COOKIE"]).toBe("***");
        expect(result.parameterValues["ACCESS_TOKEN"]).toBe("***");
        expect(result.parameterValues["PASSWORD"]).toBe("***");
        expect(result.parameterValues["client_id"]).toBe("cid-123");
        expect(result.parameterValues["base_url"]).toBe("https://api.example.com");
        expect(JSON.stringify(result)).not.toContain("sk-secret-abc");
        expect(JSON.stringify(result)).not.toContain("cookie-abc");
        expect(JSON.stringify(result)).not.toContain("tok-abc");
        expect(JSON.stringify(result)).not.toContain("p@ss");
    });

    it("is case-insensitive when detecting secret-like parameter names", () => {
        const input = {
            parameterValues: { api_key: "lower-secret", myToken: "my-tok" },
        };
        const result = redact_config_raw(input) as { parameterValues: Record<string, unknown> };
        expect(result.parameterValues["api_key"]).toBe("***");
        expect(result.parameterValues["myToken"]).toBe("***");
    });

    it("preserves non-secret values and structure", () => {
        const input = {
            instanceId: "claude-1",
            enabled: true,
            refreshIntervalSeconds: 300,
            parameterValues: { display_name: "My Account" },
        };
        const result = redact_config_raw(input) as Record<string, unknown>;
        expect(result["instanceId"]).toBe("claude-1");
        expect(result["enabled"]).toBe(true);
        expect(result["refreshIntervalSeconds"]).toBe(300);
        expect((result["parameterValues"] as Record<string, unknown>)["display_name"]).toBe(
            "My Account",
        );
    });

    it("handles nested secrets inside arrays", () => {
        const input = [
            { secrets: { API_KEY: "arr-secret" } },
            { parameterValues: { TOKEN: "arr-tok" } },
        ];
        const result = redact_config_raw(input) as Record<string, unknown>[];
        expect((result[0]?.["secrets"] as Record<string, unknown>)["API_KEY"]).toBe("***");
        expect((result[1]?.["parameterValues"] as Record<string, unknown>)["TOKEN"]).toBe("***");
        expect(JSON.stringify(result)).not.toContain("arr-secret");
        expect(JSON.stringify(result)).not.toContain("arr-tok");
    });
});

describe("redact_config_json", () => {
    it("redacts secrets in parsed JSON", () => {
        const raw = JSON.stringify({
            secrets: { API_KEY: "json-secret" },
            parameterValues: { TOKEN: "json-tok" },
        });
        const result = redact_config_json(raw) as {
            secrets: Record<string, unknown>;
            parameterValues: Record<string, unknown>;
        };
        expect(result.secrets["API_KEY"]).toBe("***");
        expect(result.parameterValues["TOKEN"]).toBe("***");
        expect(JSON.stringify(result)).not.toContain("json-secret");
        expect(JSON.stringify(result)).not.toContain("json-tok");
    });

    it("returns fallback for unparseable JSON", () => {
        const result = redact_config_json("{not valid");
        expect(result).toEqual({ bytes: "{not valid".length, parseable: false });
    });
});

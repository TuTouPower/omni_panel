import { describe, it, expect } from "vitest";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";
import {
    fallback_secret_name,
    resolve_auth_descriptor,
    resolve_auth_method,
} from "../../../../src/renderer/lib/auth-flow-registry";

function make_connector(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
    return {
        instanceId: "test-1",
        sourceInstanceId: "test-1",
        stateId: "test-1",
        name: "Test",
        displayName: "Test",
        enabled: true,
        source: "poll",
        supportedProviders: ["test"],
        activeProviders: ["test"],
        metadata: null,
        snapshot: { status: "idle" },
        ...overrides,
    };
}

describe("resolve_auth_method", () => {
    it("prefers manifest-declared auth method", () => {
        const connector = make_connector({
            metadata: {
                name: "grok",
                auth: { method: "oauth_device", secret_name: "OAUTH_TOKEN" },
            },
        });
        expect(resolve_auth_method(connector)).toBe("oauth_device");
    });

    it("returns cpa_mgmt when declared in descriptor", () => {
        const connector = make_connector({
            metadata: {
                name: "cpa",
                auth: { method: "cpa_mgmt", secret_name: "cpa_mgmt_key", require_endpoint: true },
            },
        });
        expect(resolve_auth_method(connector)).toBe("cpa_mgmt");
    });

    it("falls back to session for session source", () => {
        const connector = make_connector({ source: "session" });
        expect(resolve_auth_method(connector)).toBe("session");
    });

    it("falls back to local_cli for local source", () => {
        const connector = make_connector({ source: "local" });
        expect(resolve_auth_method(connector)).toBe("local_cli");
    });

    it("defaults to apikey for poll source", () => {
        const connector = make_connector({ source: "poll" });
        expect(resolve_auth_method(connector)).toBe("apikey");
    });

    it("defaults to apikey for gateway source", () => {
        const connector = make_connector({ source: "gateway" });
        expect(resolve_auth_method(connector)).toBe("apikey");
    });

    it("defaults to apikey when connector is missing", () => {
        expect(resolve_auth_method(undefined)).toBe("apikey");
    });

    it("ignores source when auth descriptor is present", () => {
        const connector = make_connector({
            source: "session",
            metadata: {
                name: "opencode_go",
                auth: { method: "web_login", secret_name: "SESSION_COOKIE" },
            },
        });
        expect(resolve_auth_method(connector)).toBe("web_login");
    });
});

describe("resolve_auth_descriptor", () => {
    it("returns the auth descriptor when present", () => {
        const auth = { method: "apikey" as const, secret_name: "SERVICE_KEY" };
        const connector = make_connector({ metadata: { name: "exa", auth } });
        expect(resolve_auth_descriptor(connector)).toEqual(auth);
    });

    it("returns null when missing", () => {
        const connector = make_connector({ metadata: { name: "deepseek" } });
        expect(resolve_auth_descriptor(connector)).toBeNull();
    });

    it("returns null when metadata is missing", () => {
        expect(resolve_auth_descriptor(undefined)).toBeNull();
    });
});

describe("fallback_secret_name", () => {
    it("returns the first secret parameter name", () => {
        const connector = make_connector({
            metadata: {
                name: "kimi",
                parameters: [
                    { name: "API_KEY", label: "API Key", type: "secret", required: true },
                    { name: "LIMIT", label: "Limit", type: "string", required: false },
                ],
            },
        });
        expect(fallback_secret_name(connector)).toBe("API_KEY");
    });

    it("defaults to API_KEY when no secret parameter exists", () => {
        const connector = make_connector({
            metadata: {
                name: "noop",
                parameters: [{ name: "LIMIT", label: "Limit", type: "string", required: false }],
            },
        });
        expect(fallback_secret_name(connector)).toBe("API_KEY");
    });

    it("defaults to API_KEY when metadata is missing", () => {
        expect(fallback_secret_name(undefined)).toBe("API_KEY");
    });
});

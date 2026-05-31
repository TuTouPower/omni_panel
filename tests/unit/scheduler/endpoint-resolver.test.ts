import { describe, it, expect } from "vitest";
import { resolveRuntimeEnv } from "../../../src/main/core/scheduler/endpoint-resolver";
import type { PluginConfiguration, AppConfiguration } from "../../../src/shared/types/config";

function make_plugin(overrides: Record<string, string> = {}): PluginConfiguration {
    return {
        instanceId: "p1",
        stateId: "p1",
        name: "test",
        enabled: true,
        executablePath: "/path",
        refreshIntervalSeconds: 300,
        parameterValues: {},
        endpointOverrides: overrides,
    };
}

function make_config(proxy?: { url: string; noProxy?: string[] }): AppConfiguration {
    return {
        schemaVersion: 1,
        language: "zh-Hans",
        plugins: [],
        launchAtLogin: false,
        ...(proxy ? { proxy } : {}),
    };
}

describe("resolveRuntimeEnv", () => {
    it("only metadata defaults -> OMNI_PLUGIN_ENDPOINTS contains those defaults", () => {
        const result = resolveRuntimeEnv(
            { default: "http://localhost:8080", extra: "http://localhost:9090" },
            make_plugin(),
            make_config(),
        );
        expect(result.endpoints).toBe(
            JSON.stringify({ default: "http://localhost:8080", extra: "http://localhost:9090" }),
        );
    });

    it("override replaces metadata default", () => {
        const result = resolveRuntimeEnv(
            { default: "http://localhost:8080" },
            make_plugin({ default: "http://custom:3000" }),
            make_config(),
        );
        expect(result.endpoints).toBe(JSON.stringify({ default: "http://custom:3000" }));
    });

    it("empty override string does NOT replace metadata default", () => {
        const result = resolveRuntimeEnv(
            { default: "http://localhost:8080" },
            make_plugin({ default: "   " }),
            make_config(),
        );
        expect(result.endpoints).toBe(JSON.stringify({ default: "http://localhost:8080" }));
    });

    it("null metadata default + override gives value -> appears in output", () => {
        const result = resolveRuntimeEnv(
            { default: null },
            make_plugin({ default: "http://custom:3000" }),
            make_config(),
        );
        expect(result.endpoints).toBe(JSON.stringify({ default: "http://custom:3000" }));
    });

    it("null metadata default + no override -> key absent from output", () => {
        const result = resolveRuntimeEnv({ default: null }, make_plugin(), make_config());
        expect(result.endpoints).toBeUndefined();
    });

    it("proxy present in appConfig -> OMNI_PLUGIN_PROXY serialized", () => {
        const proxy = { url: "http://proxy:8080", noProxy: ["localhost"] };
        const result = resolveRuntimeEnv(undefined, make_plugin(), make_config(proxy));
        expect(result.proxy).toBe(JSON.stringify(proxy));
    });

    it("no proxy -> no OMNI_PLUGIN_PROXY", () => {
        const result = resolveRuntimeEnv(undefined, make_plugin(), make_config());
        expect(result.proxy).toBeUndefined();
    });

    it("both endpoints empty + no proxy -> no env vars returned", () => {
        const result = resolveRuntimeEnv(undefined, make_plugin(), make_config());
        expect(result.endpoints).toBeUndefined();
        expect(result.proxy).toBeUndefined();
    });
});

import { describe, expect, it } from "vitest";
import {
    build_secret_param_keys,
    find_unknown_manifest_ids,
} from "../../../src/main/core/config/secret_param_keys";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { AppConfiguration, ConnectorConfiguration } from "../../../src/shared/types/config";
import { manifest_schema } from "../../../src/shared/schemas/manifest";

function make_plugin(
    instance_id: string,
    executable_path: string,
    manifest_id = executable_path.split(/[\\/]/).pop() ?? instance_id,
): ConnectorConfiguration {
    return {
        instanceId: instance_id,
        stateId: `${instance_id}-state`,
        manifestId: manifest_id,
        name: instance_id,
        enabled: true,
        executablePath: executable_path,
        refreshIntervalSeconds: 300,
        parameterValues: {},
        endpointOverrides: {},
    };
}

function make_config(plugins: readonly ConnectorConfiguration[]): AppConfiguration {
    return {
        schemaVersion: 2,
        language: "zh-Hans",
        plugins,
        launchAtLogin: false,
    };
}

function make_definition(
    executable_path: string,
    options: {
        readonly id: string;
        readonly auth_method?: "apikey" | "oauth_device" | "oauth_pkce";
        readonly auth_secret?: string;
        readonly secret_parameters?: readonly string[];
    },
): ConnectorDefinition {
    return {
        directory: executable_path,
        executablePath: executable_path,
        manifest: manifest_schema.parse({
            id: options.id,
            provider: options.id,
            capabilities: ["poll"],
            parameters: (options.secret_parameters ?? []).map((name) => ({
                name,
                type: "secret",
                required: false,
            })),
            auth:
                options.auth_method && options.auth_secret
                    ? { method: options.auth_method, secret_name: options.auth_secret }
                    : undefined,
            endpoints: { default: "https://example.com" },
            poll: {
                request: { endpoint: "default", path: "/usage", method: "GET" },
                map: {},
            },
        }),
    };
}

describe("build_secret_param_keys", () => {
    it("allows the complete OAuth token set for oauth_device connectors", () => {
        const plugin = make_plugin("grok-instance", "connectors/grok");
        const definitions = [
            make_definition("connectors/grok", {
                id: "grok",
                auth_method: "oauth_device",
                auth_secret: "OAUTH_TOKEN",
            }),
        ];

        const keys = build_secret_param_keys(make_config([plugin]), definitions);

        expect([...(keys.get("grok-instance") ?? [])].sort()).toEqual([
            "OAUTH_EXPIRES_AT",
            "OAUTH_REFRESH_TOKEN",
            "OAUTH_TOKEN",
        ]);
    });

    it("allows the complete OAuth token set for oauth_pkce connectors (A72)", () => {
        const plugin = make_plugin("grok-bot-instance", "connectors/grok_bot");
        const definitions = [
            make_definition("connectors/grok_bot", {
                id: "grok_bot",
                auth_method: "oauth_pkce",
                auth_secret: "ACCESS_TOKEN",
            }),
        ];

        const keys = build_secret_param_keys(make_config([plugin]), definitions);

        expect([...(keys.get("grok-bot-instance") ?? [])].sort()).toEqual([
            "ACCESS_TOKEN",
            "OAUTH_EXPIRES_AT",
            "OAUTH_REFRESH_TOKEN",
        ]);
    });

    it("keeps manifest secret parameters and adds OAuth refresh metadata", () => {
        const plugin = make_plugin("kimi-instance", "connectors/kimi");
        const definitions = [
            make_definition("connectors/kimi", {
                id: "kimi",
                auth_method: "oauth_device",
                auth_secret: "OAUTH_TOKEN",
                secret_parameters: ["OAUTH_TOKEN", "API_KEY"],
            }),
        ];

        const keys = build_secret_param_keys(make_config([plugin]), definitions);

        expect([...(keys.get("kimi-instance") ?? [])].sort()).toEqual([
            "API_KEY",
            "OAUTH_EXPIRES_AT",
            "OAUTH_REFRESH_TOKEN",
            "OAUTH_TOKEN",
        ]);
    });

    it("does not expand non-OAuth auth descriptors", () => {
        const plugin = make_plugin("api-instance", "connectors/api", "api_connector");
        const definitions = [
            make_definition("connectors/api", {
                id: "api_connector",
                auth_method: "apikey",
                auth_secret: "AUTH_SECRET",
                secret_parameters: ["API_KEY"],
            }),
        ];

        const keys = build_secret_param_keys(make_config([plugin]), definitions);

        expect([...(keys.get("api-instance") ?? [])]).toEqual(["API_KEY"]);
    });

    it("reports unknown manifest ids once", () => {
        const config = make_config([
            make_plugin("known-instance", "connectors/known"),
            make_plugin("missing-instance", "connectors/missing"),
            make_plugin("missing-instance-2", "connectors/missing"),
        ]);
        const unknown = find_unknown_manifest_ids(config, [
            make_definition("connectors/known", { id: "known" }),
        ]);

        expect(unknown).toEqual(["missing"]);
    });
});

import { describe, it, expect } from "vitest";
import {
    auto_seed_connectors,
    apply_auto_seed_and_migrate,
    resolve_refresh_interval,
    FOLLOW_GLOBAL_REFRESH_SENTINEL,
    DEFAULT_FALLBACK_REFRESH_SECONDS,
} from "../../../../../src/main/core/config/auto-seed";
import type { ConnectorDefinition } from "../../../../../src/main/core/connector/manifest-loader";
import type {
    AppConfiguration,
    ConnectorConfiguration,
} from "../../../../../src/shared/types/config";
import type { Manifest } from "../../../../../src/shared/schemas/manifest";

function make_definition(
    id: string,
    opts: { manualDefault?: boolean; auth?: Manifest["auth"] } = {},
): ConnectorDefinition {
    const manifest: Manifest = {
        id,
        provider: "claude",
        capabilities: ["local"],
        parameters: [],
        local: { paths: ["~/foo"] },
        ...(opts.manualDefault !== undefined && { manualDefault: opts.manualDefault }),
        ...(opts.auth !== undefined && { auth: opts.auth }),
    };
    return {
        directory: `/connectors/${id}`,
        executablePath: `/connectors/${id}`,
        manifest,
    };
}

function make_existing(
    id: string,
    overrides: Partial<ConnectorConfiguration> = {},
): ConnectorConfiguration {
    return {
        instanceId: `${id}-inst`,
        stateId: `${id}-state`,
        manifestId: id,
        name: id.toUpperCase(),
        enabled: true,
        executablePath: `/old/${id}`,
        refreshIntervalSeconds: 600,
        parameterValues: {},
        endpointOverrides: {},
        ...overrides,
    };
}

describe("auto_seed_connectors", () => {
    it("seeds new connectors with refreshIntervalSeconds = 0 (follow-global sentinel)", () => {
        const result = auto_seed_connectors([], [make_definition("claude")]);
        expect(result.seeded).toHaveLength(1);
        expect(result.seeded[0]?.refreshIntervalSeconds).toBe(FOLLOW_GLOBAL_REFRESH_SENTINEL);
        expect(result.seeded[0]?.refreshIntervalSeconds).toBe(0);
    });

    it("does NOT use 300 as the seed default", () => {
        const result = auto_seed_connectors([], [make_definition("deepseek")]);
        expect(result.seeded[0]?.refreshIntervalSeconds).not.toBe(300);
    });

    it("preserves existing connector interval (does not reset to sentinel)", () => {
        const existing = [make_existing("claude", { refreshIntervalSeconds: 120 })];
        const result = auto_seed_connectors(existing, [make_definition("claude")]);
        expect(result.seeded).toHaveLength(0);
        expect(existing[0]?.refreshIntervalSeconds).toBe(120);
    });

    it("updates existing connector executablePath when it moved", () => {
        const existing = [make_existing("claude")];
        const result = auto_seed_connectors(existing, [make_definition("claude")]);
        expect(result.changed).toBe(true);
        // Must NOT mutate the original input
        expect(existing[0]?.executablePath).toBe("/old/claude");
        // Updated entry is returned in updatedExisting
        expect(result.updatedExisting).toHaveLength(1);
        expect(result.updatedExisting[0]?.executablePath).toBe("/connectors/claude");
        // Other fields preserved from original
        expect(result.updatedExisting[0]?.instanceId).toBe("claude-inst");
        expect(result.updatedExisting[0]?.refreshIntervalSeconds).toBe(600);
    });

    it("updates every existing instance without collapsing same-manifest instances", () => {
        const existing = [
            make_existing("claude", {
                instanceId: "claude-primary",
                stateId: "claude-primary",
                executablePath: "/old/claude",
            }),
            make_existing("claude", {
                instanceId: "claude-secondary",
                stateId: "claude-secondary",
                executablePath: "/another/old/claude",
                enabled: false,
                parameterValues: { MODEL: "custom" },
            }),
        ];

        const result = auto_seed_connectors(existing, [make_definition("claude")]);

        expect(result.seeded).toHaveLength(0);
        expect(result.updatedExisting).toHaveLength(2);
        expect(result.updatedExisting.map((plugin) => plugin.instanceId)).toEqual([
            "claude-primary",
            "claude-secondary",
        ]);
        expect(result.updatedExisting[1]).toMatchObject({
            manifestId: "claude",
            executablePath: "/connectors/claude",
            enabled: false,
            parameterValues: { MODEL: "custom" },
        });
    });

    it("sets manualRefreshOnly when manifest declares manualDefault", () => {
        const result = auto_seed_connectors(
            [],
            [make_definition("claude", { manualDefault: true })],
        );
        expect(result.seeded[0]?.manualRefreshOnly).toBe(true);
    });

    it("does not match an existing connector whose dir name merely contains the id (A10)", () => {
        // "cpa" must not be treated as already-seeded just because a directory
        // named "cpadapter" contains the substring "cpa" — otherwise deleted
        // connectors with overlapping names silently resurrect.
        const existing = [
            make_existing("cpadapter", {
                name: "CPADAPTER",
                executablePath: "/old/cpadapter",
            }),
        ];
        const result = auto_seed_connectors(existing, [make_definition("cpa")]);
        expect(result.seeded).toHaveLength(1);
        expect(result.seeded[0]?.name).toBe("CPA");
        expect(result.updatedExisting).toHaveLength(0);
    });

    it("skips connectors whose manifest id is tombstoned (t038)", () => {
        // 删除内置连接器后记 tombstone，重启 auto-seed 不得复活
        const result = auto_seed_connectors(
            [],
            [make_definition("claude"), make_definition("glm")],
            new Set(["glm"]),
        );
        expect(result.seeded).toHaveLength(1);
        expect(result.seeded[0]?.name).toBe("CLAUDE");
    });

    it("skips interactive auth connectors (oauth_pkce, oauth_device, web_login)", () => {
        const pkce_def = make_definition("grok_bot", {
            auth: { method: "oauth_pkce", secret_name: "ACCESS_TOKEN" },
        });
        const device_def = make_definition("grok", {
            auth: { method: "oauth_device", secret_name: "OAUTH_TOKEN" },
        });
        const web_def = make_definition("kimi_web", {
            auth: { method: "web_login", secret_name: "COOKIE" },
        });
        const apikey_def = make_definition("deepseek", {
            auth: { method: "apikey", secret_name: "API_KEY" },
        });

        const result = auto_seed_connectors([], [pkce_def, device_def, web_def, apikey_def]);
        expect(result.seeded).toHaveLength(1);
        expect(result.seeded[0]?.name).toBe("DEEPSEEK");
    });

    it("cleans up legacy unconfigured empty instances of interactive auth connectors (A79)", () => {
        const pkce_def = make_definition("grok_bot", {
            auth: { method: "oauth_pkce", secret_name: "ACCESS_TOKEN" },
        });
        const legacy_empty = make_existing("grok_bot", {
            name: "GROK_BOT",
            parameterValues: {},
            endpointOverrides: {},
        });
        const configured = make_existing("claude", {
            name: "CLAUDE",
        });

        const result = auto_seed_connectors(
            [legacy_empty, configured],
            [pkce_def, make_definition("claude")],
        );
        expect(result.cleanedInstanceIds).toContain("grok_bot-inst");
        expect(result.changed).toBe(true);
    });

    it("apply_auto_seed_and_migrate cleans empty instances and bumps schemaVersion to 2 (A79 / AC-008)", () => {
        const pkce_def = make_definition("grok_bot", {
            auth: { method: "oauth_pkce", secret_name: "ACCESS_TOKEN" },
        });
        const legacy_empty = make_existing("grok_bot", {
            name: "GROK_BOT",
            parameterValues: {},
            endpointOverrides: {},
        });
        const configured = make_existing("claude", {
            name: "CLAUDE",
        });

        const initial_config: AppConfiguration = {
            schemaVersion: 1,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [legacy_empty, configured],
        };

        const { updatedConfig, changed } = apply_auto_seed_and_migrate(initial_config, [
            pkce_def,
            make_definition("claude"),
        ]);

        expect(changed).toBe(true);
        expect(updatedConfig.schemaVersion).toBe(2);
        expect(updatedConfig.plugins.map((p) => p.instanceId)).not.toContain("grok_bot-inst");
        expect(updatedConfig.plugins.map((p) => p.instanceId)).toContain("claude-inst");
    });

    it("case-insensitively compares executablePath on windows/darwin (A63)", () => {
        const def = make_definition("claude");
        (def as { executablePath: string }).executablePath = "C:\\Connectors\\Claude";
        const existing = [
            make_existing("claude", {
                executablePath: "c:\\connectors\\claude",
            }),
        ];
        const orig_platform = process.platform;
        try {
            Object.defineProperty(process, "platform", { value: "win32" });
            const result = auto_seed_connectors(existing, [def]);
            expect(result.updatedExisting).toHaveLength(0);
        } finally {
            Object.defineProperty(process, "platform", { value: orig_platform });
        }
    });

    it("A138 / AC-003: auto_seed skips CPA manager connector which requires user-configured management endpoint", () => {
        const cpa_def = make_definition("cpa", {
            auth: { method: "cpa_mgmt", secret_name: "CPA_MGMT_KEY" },
        });
        const result = auto_seed_connectors([], [cpa_def]);
        expect(result.seeded).toHaveLength(0);
    });
});

describe("resolve_refresh_interval", () => {
    it("returns connector interval when > 0", () => {
        expect(resolve_refresh_interval(120, 600)).toBe(120);
    });

    it("falls back to global interval when connector <= 0", () => {
        expect(resolve_refresh_interval(0, 900)).toBe(900);
    });

    it("falls back to default when both connector and global are <= 0", () => {
        expect(resolve_refresh_interval(0, undefined)).toBe(DEFAULT_FALLBACK_REFRESH_SECONDS);
        expect(resolve_refresh_interval(0, 0)).toBe(DEFAULT_FALLBACK_REFRESH_SECONDS);
    });

    it("default fallback is 300", () => {
        expect(DEFAULT_FALLBACK_REFRESH_SECONDS).toBe(300);
    });
});

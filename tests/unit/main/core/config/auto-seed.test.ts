import { describe, it, expect } from "vitest";
import {
    auto_seed_connectors,
    resolve_refresh_interval,
    FOLLOW_GLOBAL_REFRESH_SENTINEL,
    DEFAULT_FALLBACK_REFRESH_SECONDS,
} from "../../../../../src/main/core/config/auto-seed";
import type { ConnectorDefinition } from "../../../../../src/main/core/connector/manifest-loader";
import type { ConnectorConfiguration } from "../../../../../src/shared/types/config";
import type { Manifest } from "../../../../../src/shared/schemas/manifest";

function make_definition(id: string, opts: { manualDefault?: boolean } = {}): ConnectorDefinition {
    const manifest: Manifest = {
        id,
        provider: "claude",
        capabilities: ["local"],
        parameters: [],
        local: { paths: ["~/foo"] },
        ...(opts.manualDefault !== undefined && { manualDefault: opts.manualDefault }),
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
        expect(existing[0]?.executablePath).toBe("/connectors/claude");
    });

    it("sets manualRefreshOnly when manifest declares manualDefault", () => {
        const result = auto_seed_connectors(
            [],
            [make_definition("brave", { manualDefault: true })],
        );
        expect(result.seeded[0]?.manualRefreshOnly).toBe(true);
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

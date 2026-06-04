import { describe, expect, it } from "vitest";

import type { UsageItem } from "../../../src/shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../../src/shared/types/ipc";
import {
    buildProviderUsageGroups,
    buildOverviewForGroup,
    getVisibleProviders,
} from "../../../src/renderer/lib/provider-usage";

function usageItem(overrides: Partial<UsageItem> = {}): UsageItem {
    return {
        id: "claude-window",
        provider: "claude",
        source: "cpa",
        sourceInstanceId: "cpa-main",
        accountId: "account-1",
        accountLabel: "Claude Account",
        name: "Claude Pro",
        used: 10,
        limit: 100,
        displayStyle: "percent",
        resetAt: null,
        status: "normal",
        ...overrides,
    };
}

function connectorInfo(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
    const source = overrides.source ?? "cpa";
    const supportedProviders = overrides.supportedProviders ?? ["claude"];
    const activeProviders = overrides.activeProviders ?? supportedProviders;

    return {
        instanceId: `${source}-connector`,
        sourceInstanceId: `${source}-main`,
        stateId: `${source}-connector`,
        name: `${source}-connector`,
        displayName: `${source.toUpperCase()} Connector`,
        enabled: true,
        source,
        supportedProviders,
        activeProviders,
        metadata: null,
        snapshot: {
            status: "ready",
            items: [],
            updatedAt: "2026-01-01T00:00:00Z",
        },
        ...overrides,
    };
}

describe("provider usage aggregation", () => {
    it("groups CPA Claude items under provider claude without creating cpa provider", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                supportedProviders: ["claude", "gemini", "kimi"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem()],
                },
            }),
        ];

        const groups = buildProviderUsageGroups(connectors);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.provider).toBe("claude");
        expect(groups[0]?.label).toBe("Claude");
        expect(groups[0]?.accountCount).toBe(1);
        expect(groups[0]?.periods).toHaveLength(1);
        expect(groups.map((group) => group.provider)).not.toContain("cpa");
    });

    it("keeps GLM and MiniMax as ordered provider groups", () => {
        const connectors = [
            connectorInfo({
                source: "direct",
                sourceInstanceId: "glm-direct",
                supportedProviders: ["glm"],
                activeProviders: ["glm"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            id: "glm-window",
                            provider: "glm",
                            source: "direct",
                            sourceInstanceId: "glm-direct",
                            accountId: "glm-account",
                            accountLabel: "GLM Account",
                        }),
                    ],
                },
            }),
            connectorInfo({
                source: "api_key",
                sourceInstanceId: "minimax-api-key",
                supportedProviders: ["minimax"],
                activeProviders: ["minimax"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:05:00Z",
                    items: [
                        usageItem({
                            id: "minimax-window",
                            provider: "minimax",
                            source: "api_key",
                            sourceInstanceId: "minimax-api-key",
                            accountId: "minimax-account",
                            accountLabel: "MiniMax Account",
                        }),
                    ],
                },
            }),
        ];

        expect(buildProviderUsageGroups(connectors).map((group) => group.provider)).toEqual([
            "glm",
            "minimax",
        ]);
    });

    it("uses active CPA providers for visibility instead of all supported providers", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                supportedProviders: ["claude", "gemini", "antigravity", "kimi"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem()],
                },
            }),
        ];

        const visibleProviders = getVisibleProviders(connectors);

        expect(visibleProviders).toEqual(["claude"]);
        expect(visibleProviders).not.toContain("gemini");
        expect(visibleProviders).not.toContain("antigravity");
        expect(visibleProviders).not.toContain("kimi");
    });

    it("hides ready items from disabled connectors", () => {
        const connectors = [
            connectorInfo({
                enabled: false,
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem()],
                },
            }),
        ];

        expect(buildProviderUsageGroups(connectors)).toEqual([]);
        expect(getVisibleProviders(connectors)).toEqual([]);
    });

    it("preserves null used values in periods", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem({ used: null })],
                },
            }),
        ];

        const groups = buildProviderUsageGroups(connectors);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.periods[0]?.used).toBeNull();
        expect(groups[0]?.periods[0]?.limit).toBe(100);
    });

    it("excludes null-used periods from overview aggregation", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem({ used: null, name: "Requests" })],
                },
            }),
        ];

        const groups = buildProviderUsageGroups(connectors);
        const overview = buildOverviewForGroup(groups[0] ?? { provider: "x", accounts: [] });
        expect(overview).toHaveLength(0);
    });
});

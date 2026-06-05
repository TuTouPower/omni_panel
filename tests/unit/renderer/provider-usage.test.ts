import { describe, expect, it } from "vitest";

import type { UsageItem } from "../../../src/shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../../src/shared/types/ipc";
import {
    build_provider_usage_groups,
    build_overview_for_group,
    get_visible_providers,
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

        const groups = build_provider_usage_groups(connectors);

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

        expect(build_provider_usage_groups(connectors).map((group) => group.provider)).toEqual([
            "glm",
            "minimax",
        ]);
    });

    it("groups CPA rows by account label", () => {
        const items: UsageItem[] = Array.from({ length: 5 }).flatMap((_, index) => {
            const account_index = String(index);
            const account_label = `Codex Account ${String(index + 1)}`;
            return [
                usageItem({
                    id: `codex-${account_index}-5h`,
                    provider: "codex",
                    source: "cpa",
                    sourceInstanceId: "cpa-main",
                    accountId: `auth-${account_index}-5h`,
                    accountLabel: account_label,
                    name: "Codex · 5小时",
                }),
                usageItem({
                    id: `codex-${account_index}-week`,
                    provider: "codex",
                    source: "cpa",
                    sourceInstanceId: "cpa-main",
                    accountId: `auth-${account_index}-week`,
                    accountLabel: account_label,
                    name: "Codex · 每周",
                }),
            ];
        });
        const connectors = [
            connectorInfo({
                source: "cpa",
                supportedProviders: ["codex"],
                activeProviders: ["codex"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items,
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);

        expect(group?.accountCount).toBe(5);
        expect(
            group?.accounts.map((account) => account.periods).map((periods) => periods.length),
        ).toEqual([2, 2, 2, 2, 2]);
    });

    it("keeps non-CPA rows grouped by account id", () => {
        const connectors = [
            connectorInfo({
                source: "api_key",
                sourceInstanceId: "codex-direct",
                supportedProviders: ["codex"],
                activeProviders: ["codex"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            id: "codex-direct-1",
                            provider: "codex",
                            source: "api_key",
                            sourceInstanceId: "codex-direct",
                            accountId: "auth-1",
                            accountLabel: "Same Label",
                        }),
                        usageItem({
                            id: "codex-direct-2",
                            provider: "codex",
                            source: "api_key",
                            sourceInstanceId: "codex-direct",
                            accountId: "auth-2",
                            accountLabel: "Same Label",
                        }),
                    ],
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);

        expect(group?.accountCount).toBe(2);
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

        const visibleProviders = get_visible_providers(connectors);

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

        expect(build_provider_usage_groups(connectors)).toEqual([]);
        expect(get_visible_providers(connectors)).toEqual([]);
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

        const groups = build_provider_usage_groups(connectors);
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

        const groups = build_provider_usage_groups(connectors);
        const [group] = groups;
        if (!group) throw new Error("Expected provider usage group");
        const overview = build_overview_for_group(group);
        expect(overview).toHaveLength(0);
    });
});

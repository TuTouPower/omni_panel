import { describe, expect, it } from "vitest";

import type { UsageItem } from "../../../src/shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../../src/shared/types/ipc";
import {
    apply_account_overrides,
    build_provider_usage_groups,
    build_overview_for_group,
    format_usage_period_label,
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

describe("format_usage_period_label", () => {
    it("shortens known long model labels", () => {
        expect(format_usage_period_label("gemini-3.1-flash-lite-preview")).toBe(
            "3.1 Flash-Lite·Pv",
        );
    });

    it("lets custom label map override built-in labels", () => {
        expect(
            format_usage_period_label("gemini-3.1-flash-lite-preview", {
                "gemini-3.1-flash-lite-preview": "Gemini Custom",
            }),
        ).toBe("Gemini Custom");
    });
});

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

    it("keeps provider groups from loading snapshots with last successful items", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                supportedProviders: ["claude", "codex"],
                activeProviders: ["claude", "codex"],
                snapshot: {
                    status: "loading",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem()],
                },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.provider).toBe("claude");
        expect(groups[0]?.accountCount).toBe(1);
    });

    it("keeps provider groups from failed snapshots with last successful items", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "failed",
                    error: "timeout",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem()],
                },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.provider).toBe("claude");
        expect(groups[0]?.periods).toHaveLength(1);
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

    it("propagates latest observation freshness to periods, accounts, and groups", () => {
        const connectors = [
            connectorInfo({
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            observedAt: "2026-01-01T11:59:00Z",
                            stale: true,
                        }),
                    ],
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);

        expect(group?.stale).toBe(true);
        expect(group?.observedAt).toBe("2026-01-01T11:59:00Z");
        expect(group?.accounts[0]?.stale).toBe(true);
        expect(group?.accounts[0]?.observedAt).toBe("2026-01-01T11:59:00Z");
        expect(group?.periods[0]?.stale).toBe(true);
        expect(group?.periods[0]?.observedAt).toBe("2026-01-01T11:59:00Z");
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

    it("hides overview reset time when account reset times are too far apart", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            id: "claude-a-5h",
                            accountId: "auth-a",
                            accountLabel: "Account A",
                            name: "Claude Pro · 5小时",
                            resetAt: "2026-01-01T17:00:00Z",
                        }),
                        usageItem({
                            id: "claude-b-5h",
                            accountId: "auth-b",
                            accountLabel: "Account B",
                            name: "Claude Pro · 5小时",
                            resetAt: "2026-01-01T17:30:00Z",
                        }),
                    ],
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);
        if (!group) throw new Error("Expected provider usage group");
        const [overview] = build_overview_for_group(group);

        expect(overview?.resetAt).toBeNull();
    });

    it("separates CPA accounts with same label from different sourceInstanceId", () => {
        const connectors = [
            connectorInfo({
                source: "cpa",
                sourceInstanceId: "cpa-main",
                instanceId: "cpa-main-connector",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            source: "cpa",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-1",
                            accountLabel: "Same Label",
                        }),
                    ],
                },
            }),
            connectorInfo({
                source: "cpa",
                sourceInstanceId: "cpa-secondary",
                instanceId: "cpa-secondary-connector",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            source: "cpa",
                            sourceInstanceId: "cpa-secondary",
                            accountId: "auth-2",
                            accountLabel: "Same Label",
                        }),
                    ],
                },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);
        expect(groups).toHaveLength(1);
        expect(groups[0]?.accountCount).toBe(2);
        const ids = groups[0]?.accounts.map((a) => a.id);
        expect(ids?.[0]).not.toBe(ids?.[1]);
    });
});

describe("apply_account_overrides", () => {
    const two_account_connectors = [
        connectorInfo({
            source: "cpa",
            supportedProviders: ["claude"],
            activeProviders: ["claude"],
            snapshot: {
                status: "ready",
                updatedAt: "2026-01-01T12:00:00Z",
                items: [
                    usageItem({
                        id: "claude-a-5h",
                        provider: "claude",
                        source: "cpa",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-a",
                        accountLabel: "Account A",
                        name: "Claude Pro · 5小时",
                    }),
                    usageItem({
                        id: "claude-a-week",
                        provider: "claude",
                        source: "cpa",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-a",
                        accountLabel: "Account A",
                        name: "Claude Pro · 每周",
                    }),
                    usageItem({
                        id: "claude-b-5h",
                        provider: "claude",
                        source: "cpa",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-b",
                        accountLabel: "Account B",
                        name: "Claude Pro · 5小时",
                        used: 20,
                        limit: 200,
                    }),
                ],
            },
        }),
    ];

    it("returns groups unchanged when overrides are undefined", () => {
        const groups = build_provider_usage_groups(two_account_connectors);
        const result = apply_account_overrides(groups, undefined);
        expect(result).toEqual(groups);
    });

    it("removes hidden accounts and their periods", () => {
        const groups = build_provider_usage_groups(two_account_connectors);
        const account_a_key = groups[0]?.accounts.find((a) => a.accountLabel === "Account A")?.id;
        if (!account_a_key) throw new Error("Account A not found");

        const result = apply_account_overrides(groups, {
            hidden: { claude: [account_a_key] },
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.accountCount).toBe(1);
        expect(result[0]?.accounts[0]?.accountLabel).toBe("Account B");
        expect(result[0]?.periods).toHaveLength(1);
    });

    it("removes entire group when all accounts are hidden", () => {
        const groups = build_provider_usage_groups(two_account_connectors);
        const all_keys = groups[0]?.accounts.map((a) => a.id) ?? [];

        const result = apply_account_overrides(groups, {
            hidden: { claude: all_keys },
        });

        expect(result).toHaveLength(0);
    });

    it("removes disabled accounts the same as hidden", () => {
        const groups = build_provider_usage_groups(two_account_connectors);
        const account_b_key = groups[0]?.accounts.find((a) => a.accountLabel === "Account B")?.id;
        if (!account_b_key) throw new Error("Account B not found");

        const result = apply_account_overrides(groups, {
            disabled: { claude: [account_b_key] },
        });

        expect(result).toHaveLength(1);
        expect(result[0]?.accountCount).toBe(1);
        expect(result[0]?.accounts[0]?.accountLabel).toBe("Account A");
    });

    it("applies overrides only to the matching provider group", () => {
        const connectors = [
            connectorInfo({
                source: "api_key",
                sourceInstanceId: "shared-source",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            provider: "claude",
                            source: "api_key",
                            sourceInstanceId: "shared-source",
                            accountId: "shared-account",
                            accountLabel: "Shared Account",
                        }),
                    ],
                },
            }),
            connectorInfo({
                source: "api_key",
                sourceInstanceId: "shared-source",
                supportedProviders: ["gemini"],
                activeProviders: ["gemini"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            provider: "gemini",
                            source: "api_key",
                            sourceInstanceId: "shared-source",
                            accountId: "shared-account",
                            accountLabel: "Shared Account",
                        }),
                    ],
                },
            }),
        ];
        const groups = build_provider_usage_groups(connectors);
        const claude_key = groups.find((group) => group.provider === "claude")?.accounts[0]?.id;
        if (!claude_key) throw new Error("Claude account not found");

        const result = apply_account_overrides(groups, {
            disabled: { claude: [claude_key] },
        });

        expect(result.map((group) => group.provider)).toEqual(["gemini"]);
        expect(result[0]?.accounts[0]?.accountLabel).toBe("Shared Account");
    });
});

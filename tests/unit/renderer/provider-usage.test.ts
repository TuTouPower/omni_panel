import { describe, expect, it } from "vitest";

import type { MetricRecord } from "../../../src/shared/schemas/plugin-output";
import { usageProviderSchema } from "../../../src/shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../../src/shared/types/ipc";
import {
    apply_account_overrides,
    build_provider_usage_groups,
    build_overview_for_group,
    format_usage_period_label,
    get_visible_providers,
    resolve_convergent_epoch,
    resolve_convergent_time,
    PROVIDER_ORDER,
    PROVIDER_LABELS,
} from "../../../src/renderer/lib/provider-usage";

const ALL_PROVIDERS = usageProviderSchema.options;

describe("PROVIDER_ORDER", () => {
    it("contains all providers from usageProviderSchema", () => {
        for (const provider of ALL_PROVIDERS) {
            expect(PROVIDER_ORDER, `PROVIDER_ORDER missing "${provider}"`).toContain(provider);
        }
    });

    it("does not contain duplicates", () => {
        expect(new Set(PROVIDER_ORDER).size).toBe(PROVIDER_ORDER.length);
    });
});

describe("PROVIDER_LABELS", () => {
    it("has a label for every provider in usageProviderSchema", () => {
        for (const provider of ALL_PROVIDERS) {
            expect(
                PROVIDER_LABELS[provider],
                `PROVIDER_LABELS missing "${provider}"`,
            ).toBeDefined();
            expect(PROVIDER_LABELS[provider].length).toBeGreaterThan(0);
        }
    });
});

function usageItem(overrides: Partial<MetricRecord> = {}): MetricRecord {
    return {
        id: "claude-window",
        provider: "claude",
        source: "gateway",
        sourceInstanceId: "cpa-main",
        accountId: "account-1",
        accountLabel: "Claude Account",
        raw_label: "claude-window",
        normalized_label: "Claude Pro",
        used: 10,
        limit: 100,
        displayStyle: "percent",
        resetAt: null,
        status: "normal",
        observedAt: 1735689600000,
        stale: false,
        ...overrides,
    };
}

function connectorInfo(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
    const source = overrides.source ?? "gateway";
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
    it("returns normalized_label when no override exists", () => {
        expect(format_usage_period_label("any_raw", "我的标签")).toBe("我的标签");
    });

    it("lets custom label map override built-in labels", () => {
        expect(
            format_usage_period_label("glm-4-plus", "glm-4-plus", {
                "glm-4-plus": "GLM Custom",
            }),
        ).toBe("GLM Custom");
    });

    it("resolves label map by raw_label, not display name", () => {
        expect(
            format_usage_period_label("five_hour", "5小时", {
                five_hour: "我的5h",
            }),
        ).toBe("我的5h");
    });

    it("lets OpenCode Go raw labels override connector labels", () => {
        expect(
            format_usage_period_label("rolling", "滚动", {
                rolling: "五小时",
            }),
        ).toBe("五小时");
    });

    it("shows normalized_label when no mapping exists", () => {
        expect(format_usage_period_label("five_hour", "5小时")).toBe("5小时");
    });
});

describe("provider usage aggregation", () => {
    it("groups CPA Claude items under provider claude without creating cpa provider", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                supportedProviders: ["claude", "kimi"],
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
                source: "gateway",
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
                source: "gateway",
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
                source: "poll",
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
                            source: "poll",
                            sourceInstanceId: "glm-direct",
                            accountId: "glm-account",
                            accountLabel: "GLM Account",
                        }),
                    ],
                },
            }),
            connectorInfo({
                source: "poll",
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
                            source: "poll",
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
        const items: MetricRecord[] = Array.from({ length: 5 }).flatMap((_, index) => {
            const account_index = String(index);
            const account_label = `Codex Account ${String(index + 1)}`;
            return [
                usageItem({
                    id: `codex-${account_index}-5h`,
                    provider: "codex",
                    source: "gateway",
                    sourceInstanceId: "cpa-main",
                    accountId: `auth-${account_index}-5h`,
                    accountLabel: account_label,
                    name: "Codex · 5小时",
                }),
                usageItem({
                    id: `codex-${account_index}-week`,
                    provider: "codex",
                    source: "gateway",
                    sourceInstanceId: "cpa-main",
                    accountId: `auth-${account_index}-week`,
                    accountLabel: account_label,
                    name: "Codex · 每周",
                }),
            ];
        });
        const connectors = [
            connectorInfo({
                source: "gateway",
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
                source: "poll",
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
                            source: "poll",
                            sourceInstanceId: "codex-direct",
                            accountId: "auth-1",
                            accountLabel: "Same Label",
                        }),
                        usageItem({
                            id: "codex-direct-2",
                            provider: "codex",
                            source: "poll",
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
                source: "gateway",
                supportedProviders: ["claude", "antigravity", "kimi"],
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
                source: "gateway",
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
                            observedAt: 1735689540000,
                            stale: true,
                        }),
                    ],
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);

        expect(group?.stale).toBe(true);
        expect(group?.observedAt).toBe(1735689540000);
        expect(group?.accounts[0]?.stale).toBe(true);
        expect(group?.accounts[0]?.observedAt).toBe(1735689540000);
        expect(group?.periods[0]?.stale).toBe(true);
        expect(group?.periods[0]?.observedAt).toBe(1735689540000);
    });

    it("excludes null-used periods from overview aggregation", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
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

    it("applies label map while building overview rows", () => {
        const connectors = [
            connectorInfo({
                source: "session",
                supportedProviders: ["opencode_go"],
                activeProviders: ["opencode_go"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            id: "opencode-rolling",
                            provider: "opencode_go",
                            source: "session",
                            sourceInstanceId: "workspace-1",
                            accountId: "workspace-1",
                            accountLabel: "OpenCode",
                            raw_label: "rolling",
                            normalized_label: "滚动",
                            used: 12,
                            limit: 100,
                        }),
                    ],
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);
        if (!group) throw new Error("Expected provider usage group");

        const [overview] = build_overview_for_group(group, undefined, { rolling: "五小时" });
        expect(overview?.name).toBe("五小时");
        expect(overview?.id).toBe("overview-五小时");
    });

    it("hides overview reset time when account reset times are too far apart (default 10min)", () => {
        const base = 1735707600000;
        const connectors = [
            connectorInfo({
                source: "gateway",
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
                            resetAt: base,
                        }),
                        usageItem({
                            id: "claude-b-5h",
                            accountId: "auth-b",
                            accountLabel: "Account B",
                            name: "Claude Pro · 5小时",
                            resetAt: base + 30 * 60 * 1000,
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

    it("shows overview reset time when convergentTimeMinutes covers the spread", () => {
        const base = 1735707600000;
        const connectors = [
            connectorInfo({
                source: "gateway",
                activeProviders: ["codex"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: Array.from({ length: 5 }).map((_, i) =>
                        usageItem({
                            id: `codex-${String(i)}-week`,
                            provider: "codex",
                            accountId: `auth-${String(i)}`,
                            accountLabel: `Account ${String(i)}`,
                            name: "一周",
                            normalized_label: "一周",
                            resetAt: base + i * 5 * 60 * 1000, // 0, 5, 10, 15, 20 min apart
                        }),
                    ),
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);
        if (!group) throw new Error("Expected provider usage group");

        // default 10min: spread is 20min, should hide
        const [default_overview] = build_overview_for_group(group);
        expect(default_overview?.resetAt).toBeNull();

        // convergentTimeMinutes=60: spread is 20min < 60min, should show
        const [custom_overview] = build_overview_for_group(group, 60);
        expect(custom_overview?.resetAt).toBe(base + 20 * 60 * 1000);
    });

    it("separates CPA accounts with same label from different sourceInstanceId", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-main",
                instanceId: "cpa-main-connector",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: "auth-1",
                            accountLabel: "Same Label",
                        }),
                    ],
                },
            }),
            connectorInfo({
                source: "gateway",
                sourceInstanceId: "cpa-secondary",
                instanceId: "cpa-secondary-connector",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            source: "gateway",
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

describe("loading state preserves previous data (anti-flicker)", () => {
    it("includes items from lastSuccess when snapshot status is loading", () => {
        const items = [usageItem({ provider: "mimo", id: "mimo-window" })];
        const connectors = [
            connectorInfo({
                source: "session",
                supportedProviders: ["mimo"],
                activeProviders: ["mimo"],
                snapshot: {
                    status: "loading",
                    items,
                    updatedAt: "2026-01-01T12:00:00Z",
                },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.provider).toBe("mimo");
        expect(groups[0]?.accounts[0]?.periods).toHaveLength(1);
    });

    it("returns empty when loading and no previous items", () => {
        const connectors = [
            connectorInfo({
                source: "session",
                supportedProviders: ["mimo"],
                activeProviders: ["mimo"],
                snapshot: { status: "loading" },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);

        expect(groups).toHaveLength(0);
    });
});

describe("apply_account_overrides", () => {
    const two_account_connectors = [
        connectorInfo({
            source: "gateway",
            supportedProviders: ["claude"],
            activeProviders: ["claude"],
            snapshot: {
                status: "ready",
                updatedAt: "2026-01-01T12:00:00Z",
                items: [
                    usageItem({
                        id: "claude-a-5h",
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-a",
                        accountLabel: "Account A",
                        name: "Claude Pro · 5小时",
                    }),
                    usageItem({
                        id: "claude-a-week",
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-a",
                        accountLabel: "Account A",
                        name: "Claude Pro · 每周",
                    }),
                    usageItem({
                        id: "claude-b-5h",
                        provider: "claude",
                        source: "gateway",
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
                source: "poll",
                sourceInstanceId: "shared-source",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            provider: "claude",
                            source: "poll",
                            sourceInstanceId: "shared-source",
                            accountId: "shared-account",
                            accountLabel: "Shared Account",
                        }),
                    ],
                },
            }),
            connectorInfo({
                source: "poll",
                sourceInstanceId: "shared-source",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            provider: "kimi",
                            source: "poll",
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

        expect(result.map((group) => group.provider)).toEqual(["kimi"]);
        expect(result[0]?.accounts[0]?.accountLabel).toBe("Shared Account");
    });
});

describe("resolve_convergent_epoch", () => {
    it("returns null when epochs differ by more than default 10min threshold", () => {
        const a = 1735707600000;
        const b = a + 30 * 60 * 1000;
        expect(resolve_convergent_epoch([a, b])).toBeNull();
    });

    it("returns latest when epochs differ by less than default threshold", () => {
        const a = 1735707600000;
        const b = a + 5 * 60 * 1000;
        expect(resolve_convergent_epoch([a, b])).toBe(b);
    });

    it("returns latest when epochs differ by 30min but threshold is 60min", () => {
        const a = 1735707600000;
        const b = a + 30 * 60 * 1000;
        expect(resolve_convergent_epoch([a, b], 60 * 60 * 1000)).toBe(b);
    });

    it("returns null for empty input", () => {
        expect(resolve_convergent_epoch([])).toBeNull();
    });

    it("returns single epoch when only one valid", () => {
        expect(resolve_convergent_epoch([null, 1735707600000, null])).toBe(1735707600000);
    });
});

describe("resolve_convergent_time", () => {
    it("returns null when timestamps differ by more than default 10min threshold", () => {
        const base = "2026-01-01T12:00:00Z";
        const late = "2026-01-01T12:30:00Z";
        expect(resolve_convergent_time([base, late])).toBeNull();
    });

    it("returns latest when timestamps differ by 30min but threshold is 60min", () => {
        const base = "2026-01-01T12:00:00Z";
        const late = "2026-01-01T12:30:00Z";
        expect(resolve_convergent_time([base, late], 60 * 60 * 1000)).toBe(late);
    });
});

describe("build_overview_for_group with convergentTimeMinutes", () => {
    it("shows resetAt when accounts differ by 30min and convergentTimeMinutes is 60", () => {
        const base = 1735707600000;
        const connectors = [
            connectorInfo({
                source: "gateway",
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
                            resetAt: base,
                        }),
                        usageItem({
                            id: "claude-b-5h",
                            accountId: "auth-b",
                            accountLabel: "Account B",
                            name: "Claude Pro · 5小时",
                            resetAt: base + 30 * 60 * 1000,
                        }),
                    ],
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);
        if (!group) throw new Error("Expected provider usage group");

        const [default_overview] = build_overview_for_group(group);
        expect(default_overview?.resetAt).toBeNull();

        const [custom_overview] = build_overview_for_group(group, 60);
        expect(custom_overview?.resetAt).toBe(base + 30 * 60 * 1000);
    });
});

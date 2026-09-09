import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { MetricRecord } from "../../../src/shared/schemas/plugin-output";
import { usageProviderSchema } from "../../../src/shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../../src/shared/types/ipc";
import type { ProviderUsageGroup } from "../../../src/renderer/lib/provider-usage";
import {
    accountKey,
    apply_account_labels,
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
            expect(PROVIDER_LABELS[provider]?.length).toBeGreaterThan(0);
        }
    });
});

function usageItem(overrides: Partial<MetricRecord> = {}): MetricRecord {
    return {
        id: "claude-window",
        metric_id: "claude:account-1:claude-window",
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
        displayName: `${source}-connector`,
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

describe("build_provider_usage_groups failed-account placeholder (t040)", () => {
    it("synthesizes a failed account for enabled direct connector that failed with no items", () => {
        const connectors = [
            connectorInfo({
                instanceId: "kimi-fail",
                sourceInstanceId: "kimi-fail-src",
                name: "KIMI",
                displayName: "失败账号",
                enabled: true,
                source: "poll",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
                snapshot: { status: "failed", error: "HTTP 401" },
            }),
        ];
        const groups = build_provider_usage_groups(connectors);
        const kimi = groups.find((g) => g.provider === "kimi");
        expect(kimi, "kimi group should exist for failed direct connector").toBeDefined();
        if (!kimi) return;
        expect(kimi.accounts).toHaveLength(1);
        expect(kimi.accounts[0]?.accountLabel).toBe("失败账号");
        expect(kimi.accounts[0]?.periods).toHaveLength(0);
    });

    it("does not synthesize for gateway (CPA) failed connector", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: { status: "failed", error: "manager down" },
            }),
        ];
        const groups = build_provider_usage_groups(connectors);
        expect(groups.find((g) => g.provider === "claude")).toBeUndefined();
    });

    it("does not synthesize when failed connector still has items (stale path keeps real account)", () => {
        const connectors = [
            connectorInfo({
                source: "poll",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
                snapshot: {
                    status: "failed",
                    error: "HTTP 500",
                    updatedAt: "2026-01-01T00:00:00Z",
                    items: [usageItem({ provider: "kimi", accountId: "real-kimi" })],
                },
            }),
        ];
        const groups = build_provider_usage_groups(connectors);
        const kimi = groups.find((g) => g.provider === "kimi");
        if (!kimi) return;
        // 真实 item 聚合，不额外合成占位
        expect(kimi.accounts).toHaveLength(1);
        expect(kimi.accounts[0]?.accountId).toBe("real-kimi");
    });

    it("does not synthesize for disabled connector", () => {
        const connectors = [
            connectorInfo({
                enabled: false,
                source: "poll",
                supportedProviders: ["kimi"],
                activeProviders: ["kimi"],
                snapshot: { status: "failed", error: "x" },
            }),
        ];
        expect(
            build_provider_usage_groups(connectors).find((g) => g.provider === "kimi"),
        ).toBeUndefined();
    });
});

describe("provider usage period order", () => {
    it("puts Grok weekly usage last", () => {
        const groups = build_provider_usage_groups([
            connectorInfo({
                source: "poll",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T00:00:00Z",
                    items: [
                        usageItem({
                            provider: "grok",
                            raw_label: "credits",
                            normalized_label: "额度",
                        }),
                        usageItem({
                            provider: "grok",
                            raw_label: "grok_chat",
                            normalized_label: "Grok Chat",
                        }),
                    ],
                },
            }),
        ]);
        expect(groups[0]?.accounts[0]?.periods.map((period) => period.raw_label)).toEqual([
            "grok_chat",
            "credits",
        ]);
    });

    it("puts Grok credits after both chat and build usage", () => {
        const groups = build_provider_usage_groups([
            connectorInfo({
                source: "poll",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T00:00:00Z",
                    items: [
                        usageItem({
                            provider: "grok",
                            raw_label: "credits",
                            normalized_label: "额度",
                        }),
                        usageItem({
                            provider: "grok",
                            raw_label: "grok_build",
                            normalized_label: "Grok Build",
                        }),
                        usageItem({
                            provider: "grok",
                            raw_label: "grok_chat",
                            normalized_label: "Grok Chat",
                        }),
                    ],
                },
            }),
        ]);
        expect(groups[0]?.accounts[0]?.periods.map((period) => period.raw_label)).toEqual([
            "grok_build",
            "grok_chat",
            "credits",
        ]);
    });

    it("orders Antigravity as Gemini 5h, Gemini 7d, Claude 5h, Claude 7d", () => {
        const labels = ["claude_weekly", "gemini_weekly", "claude_five_hour", "gemini_five_hour"];
        const groups = build_provider_usage_groups([
            connectorInfo({
                supportedProviders: ["antigravity"],
                activeProviders: ["antigravity"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T00:00:00Z",
                    items: labels.map((raw_label) =>
                        usageItem({
                            provider: "antigravity",
                            raw_label,
                            normalized_label: raw_label,
                        }),
                    ),
                },
            }),
        ]);
        expect(groups[0]?.accounts[0]?.periods.map((period) => period.raw_label)).toEqual([
            "gemini_five_hour",
            "gemini_weekly",
            "claude_five_hour",
            "claude_weekly",
        ]);
    });
});

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

    it("p220: filters out malformed snapshot items without dropping valid ones", () => {
        const items = [
            usageItem(),
            null,
            "junk",
            { provider: "claude" },
        ] as unknown as readonly MetricRecord[];
        const connectors = [
            connectorInfo({
                source: "gateway",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items,
                },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);

        expect(groups).toHaveLength(1);
        expect(groups[0]?.accountCount).toBe(1);
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

    it("keeps CPA accounts separate when the connector has a remark", () => {
        const account_labels = [
            "fe.ngandelliot@gmail.com",
            "tutoupower@gmail.com",
            "thunderzf@gmail.com",
            "fen.gandelliot@gmail.com",
        ];
        const connectors = [
            connectorInfo({
                name: "CPA",
                displayName: "Oracle",
                source: "gateway",
                sourceInstanceId: "cpa-main",
                supportedProviders: ["codex"],
                activeProviders: ["codex"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-07-13T00:00:00Z",
                    items: account_labels.map((account_label, index) =>
                        usageItem({
                            id: `codex-${String(index + 1)}-primary`,
                            provider: "codex",
                            source: "gateway",
                            sourceInstanceId: "cpa-main",
                            accountId: `auth-${String(index + 1)}`,
                            accountLabel: account_label,
                            raw_label: "primary_window",
                            normalized_label: "5小时",
                        }),
                    ),
                },
            }),
        ];

        const [group] = build_provider_usage_groups(connectors);

        expect(group?.accountCount).toBe(4);
        expect(group?.accounts.map((account) => account.accountLabel)).toEqual(account_labels);
        expect(group?.accounts.map((account) => account.periods.length)).toEqual([1, 1, 1, 1]);
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

    it("t450 AC-001: CPA monitor provider with no item in ready snapshot is hidden", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                activeProviders: ["claude", "kimi"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem({ provider: "claude" })],
                },
            }),
        ];
        const visibleProviders = get_visible_providers(connectors);
        expect(visibleProviders).toEqual(["claude"]);
        expect(visibleProviders).not.toContain("kimi");
    });

    it("t450 AC-002: CPA monitor provider with item in ready snapshot stays visible", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                activeProviders: ["claude", "kimi"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem({ provider: "kimi" })],
                },
            }),
        ];
        const visibleProviders = get_visible_providers(connectors);
        expect(visibleProviders).toEqual(["kimi"]);
        expect(visibleProviders).not.toContain("claude");
    });

    it("t450 AC-003: CPA failed snapshot keeps all monitor providers visible (banner anchor)", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                activeProviders: ["claude", "kimi"],
                snapshot: { status: "failed", error: "manager down" },
            }),
        ];
        const visibleProviders = get_visible_providers(connectors);
        expect(visibleProviders).toEqual(["claude", "kimi"]);
    });

    it("t450 f001: CPA failed snapshot with stale lastSuccess items still keeps all monitor providers", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                activeProviders: ["claude", "kimi"],
                snapshot: {
                    status: "failed",
                    error: "manager down",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [usageItem({ provider: "claude" })],
                },
            }),
        ];
        const visibleProviders = get_visible_providers(connectors);
        expect(visibleProviders).toEqual(["claude", "kimi"]);
    });

    it("t450 f003: CPA ready snapshot with empty items keeps all monitor providers (保留分支)", () => {
        const connectors = [
            connectorInfo({
                source: "gateway",
                activeProviders: ["claude", "kimi"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [],
                },
            }),
        ];
        const visibleProviders = get_visible_providers(connectors);
        expect(visibleProviders).toEqual(["claude", "kimi"]);
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

    it("keeps Grok weekly overview quota last even when API returns credits first", () => {
        const group: ProviderUsageGroup = {
            provider: "grok",
            label: "Grok",
            accountCount: 1,
            status: "normal",
            updatedAt: "2026-09-09T00:00:00.000Z",
            observedAt: 0,
            source: "poll",
            stale: false,
            periods: [
                usageItem({
                    id: "credits",
                    provider: "grok",
                    raw_label: "credits",
                    normalized_label: "额度",
                    name: "额度",
                    used: 10,
                    limit: 100,
                }),
                usageItem({
                    id: "grok_build",
                    provider: "grok",
                    raw_label: "grok_build",
                    normalized_label: "Grok Build",
                    name: "Grok Build",
                    used: 20,
                    limit: 100,
                }),
                usageItem({
                    id: "grok_chat",
                    provider: "grok",
                    raw_label: "grok_chat",
                    normalized_label: "Grok Chat",
                    name: "Grok Chat",
                    used: 30,
                    limit: 100,
                }),
            ] as unknown as ProviderUsageGroup["periods"],
            accounts: [],
        };
        const overview = build_overview_for_group(group);
        expect(overview.map((period) => period.raw_label)).toEqual([
            "grok_build",
            "grok_chat",
            "credits",
        ]);
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
            hidden: { claude: [claude_key] },
        });

        expect(result.map((group) => group.provider)).toEqual(["kimi"]);
        expect(result[0]?.accounts[0]?.accountLabel).toBe("Shared Account");
    });

    // t342 AC-003：隐藏链路端到端——settings 侧写 accountKey(item) 后，
    // 主面板 apply_account_overrides 能过滤该账号。锁写键与消费键一致。
    it("hidden override written with accountKey(item) removes the account from the panel (t342)", () => {
        const item = usageItem({
            id: "claude-x-5h",
            provider: "claude",
            source: "gateway",
            sourceInstanceId: "cpa-main",
            accountId: "auth-x",
            accountLabel: "Account X",
            name: "Claude Pro · 5小时",
        });
        const connectors = [
            connectorInfo({
                source: "gateway",
                supportedProviders: ["claude"],
                activeProviders: ["claude"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [item],
                },
            }),
        ];
        const groups = build_provider_usage_groups(connectors);

        // settings 侧 hide_account 写 accountKey(item)（t342 修复点）。
        const written_key = accountKey(item);
        expect(written_key).not.toBe(item.accountId); // 裸 accountId 与 accountKey 不同

        const result = apply_account_overrides(groups, {
            hidden: { claude: [written_key] },
        });

        // 主面板不再显示该账号。
        expect(result).toHaveLength(0);
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

describe("multi-instance direct connectors (e.g. two user-added Firecrawl accounts)", () => {
    it("shows each instance as a separate account under the same provider", () => {
        const connectors: ConnectorInfo[] = [
            connectorInfo({
                instanceId: "firecrawl-a",
                sourceInstanceId: "firecrawl-a",
                name: "Firecrawl A",
                displayName: "Firecrawl A",
                source: "poll",
                supportedProviders: ["firecrawl"],
                activeProviders: ["firecrawl"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-07-03T00:00:00Z",
                    items: [
                        usageItem({
                            id: "firecrawl-a:firecrawl:credits",
                            provider: "firecrawl",
                            source: "poll",
                            sourceInstanceId: "firecrawl-a",
                            accountId: "firecrawl",
                            accountLabel: "Firecrawl A",
                            normalized_label: "Firecrawl A",
                        }),
                    ],
                },
            }),
            connectorInfo({
                instanceId: "firecrawl-b",
                sourceInstanceId: "firecrawl-b",
                name: "Firecrawl B",
                displayName: "Firecrawl B",
                source: "poll",
                supportedProviders: ["firecrawl"],
                activeProviders: ["firecrawl"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-07-03T00:00:00Z",
                    items: [
                        usageItem({
                            id: "firecrawl-b:firecrawl:credits",
                            provider: "firecrawl",
                            source: "poll",
                            sourceInstanceId: "firecrawl-b",
                            accountId: "firecrawl",
                            accountLabel: "Firecrawl B",
                            normalized_label: "Firecrawl B",
                        }),
                    ],
                },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);
        const firecrawl = groups.find((g) => g.provider === "firecrawl");
        expect(firecrawl).toBeDefined();
        if (!firecrawl) throw new Error("firecrawl group missing");
        expect(firecrawl.accountCount).toBe(2);
        expect(firecrawl.accounts.map((a) => a.accountLabel).sort()).toEqual([
            "Firecrawl A",
            "Firecrawl B",
        ]);
    });
});

describe("apply_account_labels", () => {
    const cpa_connectors = [
        connectorInfo({
            source: "gateway",
            supportedProviders: ["claude"],
            activeProviders: ["claude"],
            snapshot: {
                status: "ready",
                updatedAt: "2026-01-01T12:00:00Z",
                items: [
                    usageItem({
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-a",
                        accountLabel: "Account A",
                    }),
                    usageItem({
                        provider: "claude",
                        source: "gateway",
                        sourceInstanceId: "cpa-main",
                        accountId: "auth-b",
                        accountLabel: "Account B",
                    }),
                ],
            },
        }),
    ];

    it("returns groups unchanged when labels are undefined", () => {
        const groups = build_provider_usage_groups(cpa_connectors);
        expect(apply_account_labels(groups, undefined)).toEqual(groups);
    });

    it("overwrites the label of a matching account by (provider, accountId)", () => {
        const groups = build_provider_usage_groups(cpa_connectors);
        const result = apply_account_labels(groups, { claude: { "auth-a": "我的Claude" } });
        expect(result[0]?.accounts.map((a) => a.accountLabel).sort()).toEqual([
            "Account B",
            "我的Claude",
        ]);
    });

    it("leaves accounts without a matching entry untouched", () => {
        const groups = build_provider_usage_groups(cpa_connectors);
        const result = apply_account_labels(groups, { claude: { "auth-z": "X" } });
        expect(result[0]?.accounts.map((a) => a.accountLabel).sort()).toEqual([
            "Account A",
            "Account B",
        ]);
    });

    it("skips providers that have no label map", () => {
        const groups = build_provider_usage_groups(cpa_connectors);
        const result = apply_account_labels(groups, { deepseek: { "auth-a": "X" } });
        expect(result).toEqual(groups);
    });
});

describe("直连账号 displayName 覆盖采集层 accountLabel", () => {
    it("uses connector.displayName when it differs from name", () => {
        const connectors = [
            connectorInfo({
                source: "poll",
                sourceInstanceId: "glm-work",
                instanceId: "glm-work",
                name: "glm-connector",
                displayName: "工作账号",
                supportedProviders: ["glm"],
                activeProviders: ["glm"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            provider: "glm",
                            source: "poll",
                            sourceInstanceId: "glm-work",
                            accountId: "default",
                            accountLabel: "glm",
                            normalized_label: "glm",
                        }),
                    ],
                },
            }),
        ];
        const [group] = build_provider_usage_groups(connectors);
        expect(group?.accounts[0]?.accountLabel).toBe("工作账号");
    });

    it("keeps采集层 accountLabel when displayName equals name", () => {
        const connectors = [
            connectorInfo({
                source: "poll",
                sourceInstanceId: "glm-work",
                instanceId: "glm-work",
                supportedProviders: ["glm"],
                activeProviders: ["glm"],
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-01-01T12:00:00Z",
                    items: [
                        usageItem({
                            provider: "glm",
                            source: "poll",
                            sourceInstanceId: "glm-work",
                            accountId: "default",
                            accountLabel: "GLM 默认",
                            normalized_label: "glm",
                        }),
                    ],
                },
            }),
        ];
        const [group] = build_provider_usage_groups(connectors);
        expect(group?.accounts[0]?.accountLabel).toBe("GLM 默认");
    });
});

describe("provider-usage 命名约定 (snake_case)", () => {
    // conventions.md §1：函数名一律 snake_case。同文件已有 build_provider_usage_groups。
    const source = readFileSync(
        resolve(__dirname, "../../../src/renderer/lib/provider-usage.ts"),
        "utf8",
    );

    it("compare_providers 使用 snake_case 而非 compareProviders", () => {
        expect(source).toContain("function compare_providers(");
        expect(source).not.toContain("compareProviders");
    });

    it("latest_timestamp 使用 snake_case 而非 latestTimestamp", () => {
        expect(source).toContain("function latest_timestamp(");
        expect(source).not.toContain("latestTimestamp");
    });

    it("worst_status 使用 snake_case 而非 worstStatus", () => {
        expect(source).toContain("function worst_status(");
        expect(source).not.toContain("worstStatus");
    });

    it("to_period 使用 snake_case 而非 toPeriod", () => {
        expect(source).toContain("function to_period(");
        expect(source).not.toContain("toPeriod");
    });

    it("has_valid_quota 使用 snake_case 而非 hasValidQuota", () => {
        expect(source).toContain("function has_valid_quota(");
        expect(source).not.toContain("hasValidQuota");
    });
});

describe("custom provider fallback (t095)", () => {
    it("uses provider name as label when not in PROVIDER_LABELS", () => {
        const items = [
            usageItem({
                id: "custom-usage",
                provider: "my_vendor",
                accountLabel: "自定义账号",
            }),
        ];
        const connectors = [
            connectorInfo({
                instanceId: "my_vendor-conn",
                sourceInstanceId: "my_vendor-src",
                name: "my_vendor",
                displayName: "my_vendor",
                source: "poll",
                supportedProviders: ["my_vendor"],
                activeProviders: ["my_vendor"],
                snapshot: {
                    status: "ready",
                    items,
                    updatedAt: "2026-01-01T00:00:00Z",
                },
            }),
        ];

        const groups = build_provider_usage_groups(connectors);
        const group = groups.find((g) => g.provider === "my_vendor");
        expect(group, "custom provider group must be built").toBeDefined();
        expect(group?.label).toBe("my_vendor");
    });

    it("sorts unknown providers after known ones (fallback to end)", () => {
        const known = connectorInfo({
            instanceId: "deepseek-conn",
            sourceInstanceId: "deepseek-src",
            name: "deepseek",
            displayName: "DeepSeek",
            source: "poll",
            supportedProviders: ["deepseek"],
            activeProviders: ["deepseek"],
            snapshot: {
                status: "ready",
                items: [usageItem({ id: "deepseek-usage", provider: "deepseek" })],
                updatedAt: "2026-01-01T00:00:00Z",
            },
        });
        const custom = connectorInfo({
            instanceId: "my_vendor-conn",
            sourceInstanceId: "my_vendor-src",
            name: "my_vendor",
            displayName: "my_vendor",
            source: "poll",
            supportedProviders: ["my_vendor"],
            activeProviders: ["my_vendor"],
            snapshot: {
                status: "ready",
                items: [usageItem({ id: "my_vendor-usage", provider: "my_vendor" })],
                updatedAt: "2026-01-01T00:00:00Z",
            },
        });

        const providers = get_visible_providers([custom, known]);
        const custom_idx = providers.indexOf("my_vendor");
        const known_idx = providers.indexOf("deepseek");
        expect(custom_idx).toBeGreaterThan(known_idx);
    });
});

import { describe, it, expect } from "vitest";
import {
    collect_upcoming_resets,
    type ProviderUsageGroup,
} from "../../../../src/renderer/lib/provider-usage";
import type { MetricRecord, UsageProvider } from "../../../../src/shared/schemas/plugin-output";

const NOW = 1_700_000_000_000; // 2023-11-14T22:13:20Z
const DAY = 24 * 60 * 60 * 1000;

function period(
    overrides: Partial<{
        provider: UsageProvider;
        accountId: string;
        accountLabel: string;
        used: number | null;
        limit: number | null;
        displayStyle: MetricRecord["displayStyle"];
        resetAt: number | null;
        cycleDurationMs: number | null;
        status: MetricRecord["status"];
        raw_label: string;
    }>,
) {
    return {
        id: "p1",
        provider: overrides.provider ?? "claude",
        source: "poll" as const,
        sourceInstanceId: "si1",
        connectorInstanceId: "ci1",
        connectorDisplayName: "Claude",
        accountId: overrides.accountId ?? "acct1",
        accountLabel: overrides.accountLabel ?? "acct1@example.com",
        raw_label: overrides.raw_label ?? "5小时",
        name: overrides.raw_label ?? "5小时",
        display_label: undefined as NonNullable<MetricRecord["display_label"]> | undefined,
        used: overrides.used === undefined ? 84 : overrides.used,
        limit: overrides.limit === undefined ? 100 : overrides.limit,
        displayStyle: overrides.displayStyle ?? ("percent" as const),
        resetAt: overrides.resetAt ?? null,
        cycleDurationMs:
            overrides.cycleDurationMs === undefined ? 7 * DAY : overrides.cycleDurationMs,
        status: overrides.status ?? "warning",
        color: undefined as NonNullable<MetricRecord["color"]> | undefined,
        updatedAt: "2024-07-20T10:00:00Z",
        observedAt: NOW,
        stale: false,
    };
}

function group(
    provider: UsageProvider,
    accounts: { periods: ReturnType<typeof period>[] }[],
): ProviderUsageGroup {
    return {
        provider,
        label: provider,
        accountCount: accounts.length,
        status: "normal",
        updatedAt: "2024-07-20T10:00:00Z",
        observedAt: NOW,
        stale: false,
        periods: [],
        accounts: accounts.map((a, i) => ({
            id: `acct${String(i)}`,
            sourceInstanceId: "si1",
            accountId: a.periods[0]?.accountId ?? "acct1",
            accountLabel: a.periods[0]?.accountLabel ?? "acct1@example.com",
            status: "normal",
            updatedAt: "2024-07-20T10:00:00Z",
            observedAt: NOW,
            stale: false,
            periods: a.periods,
        })),
    };
}

/** watchedMetrics[provider][accountId] = raw_label[] — t043 metric-level opt-in. */
function watched(provider: UsageProvider, accountId: string, labels: string[]) {
    return { [provider]: { [accountId]: labels } };
}

describe("collect_upcoming_resets threshold gate", () => {
    it("returns [] when thresholdPercent is null", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: null,
                watchedMetrics: watched("claude", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toEqual([]);
    });

    it("returns [] when thresholdPercent is undefined (feature off)", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                watchedMetrics: watched("claude", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toEqual([]);
    });
});

describe("collect_upcoming_resets watchedMetrics gate (t043: default all off)", () => {
    it("returns [] when watchedMetrics is absent (default off)", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + 0.7 * DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(collect_upcoming_resets([g], { thresholdPercent: 100, now: NOW })).toEqual([]);
    });

    it("includes watched period whose remaining% <= threshold", () => {
        // cycle 7d, remaining 0.7d → 10%
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + 0.7 * DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        const result = collect_upcoming_resets([g], {
            thresholdPercent: 10,
            watchedMetrics: watched("claude", "acct0", ["5小时"]),
            now: NOW,
        });
        expect(result).toHaveLength(1);
        expect(result[0]?.resetAt).toBe(NOW + 0.7 * DAY);
        expect(result[0]?.rawLabel).toBe("5小时");
    });

    it("excludes period whose raw_label is not watched", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + 0.7 * DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: 100,
                watchedMetrics: watched("claude", "acct0", ["其他标签"]),
                now: NOW,
            }),
        ).toHaveLength(0);
    });

    it("excludes period whose account is not watched", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + 0.7 * DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: 100,
                watchedMetrics: watched("claude", "other", ["5小时"]),
                now: NOW,
            }),
        ).toHaveLength(0);
    });

    it("excludes period whose provider is not watched", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + 0.7 * DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: 100,
                watchedMetrics: watched("kimi", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toHaveLength(0);
    });

    it("excludes watched period whose remaining% > threshold", () => {
        // cycle 7d, remaining 5d → ~71.4%, threshold 50
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + 5 * DAY, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: 50,
                watchedMetrics: watched("claude", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toHaveLength(0);
    });

    it("skips watched period with cycleDurationMs null", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW + DAY, cycleDurationMs: null })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: 100,
                watchedMetrics: watched("claude", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toHaveLength(0);
    });

    it("skips watched period with resetAt null", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: null, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: 100,
                watchedMetrics: watched("claude", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toHaveLength(0);
    });

    it("skips watched period with resetAt <= now (already reset)", () => {
        const g = group("claude", [
            { periods: [period({ resetAt: NOW - 1000, cycleDurationMs: 7 * DAY })] },
        ]);
        expect(
            collect_upcoming_resets([g], {
                thresholdPercent: 100,
                watchedMetrics: watched("claude", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toHaveLength(0);
    });
});

describe("collect_upcoming_resets output shape", () => {
    it("computes percent as used/limit clamped 0-100", () => {
        const g = group("deepseek", [
            {
                periods: [
                    period({
                        used: 5,
                        limit: 8,
                        displayStyle: "ratio",
                        resetAt: NOW + DAY,
                        cycleDurationMs: 7 * DAY,
                    }),
                    period({
                        used: 12,
                        limit: 10,
                        displayStyle: "ratio",
                        resetAt: NOW + 0.5 * DAY,
                        cycleDurationMs: 7 * DAY,
                    }),
                ],
            },
        ]);
        const result = collect_upcoming_resets([g], {
            thresholdPercent: 100,
            watchedMetrics: watched("deepseek", "acct0", ["5小时"]),
            now: NOW,
        });
        expect(result[0]?.percent).toBe(100); // clamp 120 → 100 (sorted first by resetAt)
        expect(result[1]?.percent).toBe(63); // 5/8 = 62.5 → 63
    });

    it("reports percent 0 when watched period has invalid used/limit", () => {
        const g = group("claude", [
            {
                periods: [
                    period({ used: null, limit: 100, resetAt: NOW + DAY }),
                    period({ used: 50, limit: 0, resetAt: NOW + 0.5 * DAY }),
                ],
            },
        ]);
        const result = collect_upcoming_resets([g], {
            thresholdPercent: 100,
            watchedMetrics: watched("claude", "acct0", ["5小时"]),
            now: NOW,
        });
        expect(result.map((r) => r.percent)).toEqual([0, 0]);
    });

    it("sorts by resetAt ascending", () => {
        const g = group("claude", [
            {
                periods: [
                    period({ raw_label: "一周", resetAt: NOW + 5 * DAY }),
                    period({ raw_label: "5小时", resetAt: NOW + 1 * DAY }),
                    period({ raw_label: "一月", resetAt: NOW + 3 * DAY }),
                ],
            },
        ]);
        const result = collect_upcoming_resets([g], {
            thresholdPercent: 100,
            watchedMetrics: watched("claude", "acct0", ["一周", "5小时", "一月"]),
            now: NOW,
        });
        expect(result.map((r) => r.resetAt)).toEqual([NOW + DAY, NOW + 3 * DAY, NOW + 5 * DAY]);
    });

    it("flattens across providers and accounts", () => {
        const g1 = group("claude", [{ periods: [period({ resetAt: NOW + 2 * DAY })] }]);
        const g2 = group("kimi", [
            { periods: [period({ provider: "kimi", resetAt: NOW + 1 * DAY })] },
        ]);
        const result = collect_upcoming_resets([g1, g2], {
            thresholdPercent: 100,
            watchedMetrics: {
                claude: { acct0: ["5小时"] },
                kimi: { acct0: ["5小时"] },
            },
            now: NOW,
        });
        expect(result.map((r) => r.provider)).toEqual(["kimi", "claude"]);
    });

    it("returns empty for empty groups", () => {
        expect(
            collect_upcoming_resets([], {
                thresholdPercent: 50,
                watchedMetrics: watched("claude", "acct0", ["5小时"]),
                now: NOW,
            }),
        ).toEqual([]);
    });
});

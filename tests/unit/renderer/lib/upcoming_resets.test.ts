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
        cycleDurationMs: null as MetricRecord["cycleDurationMs"],
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

describe("collect_upcoming_resets", () => {
    it("returns empty for empty groups input", () => {
        expect(collect_upcoming_resets([], 7 * DAY, NOW)).toEqual([]);
    });

    it("skips periods with resetAt null", () => {
        const g = group("claude", [{ periods: [period({ resetAt: null })] }]);
        expect(collect_upcoming_resets([g], 7 * DAY, NOW)).toEqual([]);
    });

    it("keeps periods within (now, now+horizon]", () => {
        const g = group("claude", [
            {
                periods: [
                    period({ resetAt: NOW + 3 * DAY }), // inside
                    period({ resetAt: NOW + 10 * DAY }), // outside (beyond horizon)
                ],
            },
        ]);
        const result = collect_upcoming_resets([g], 7 * DAY, NOW);
        expect(result).toHaveLength(1);
        expect(result[0]?.resetAt).toBe(NOW + 3 * DAY);
    });

    it("treats resetAt = now+horizon as included (closed right endpoint)", () => {
        const g = group("claude", [{ periods: [period({ resetAt: NOW + 7 * DAY })] }]);
        const result = collect_upcoming_resets([g], 7 * DAY, NOW);
        expect(result).toHaveLength(1);
        expect(result[0]?.resetAt).toBe(NOW + 7 * DAY);
    });

    it("skips resetAt = now (already reset, half-open left)", () => {
        const g = group("claude", [{ periods: [period({ resetAt: NOW })] }]);
        expect(collect_upcoming_resets([g], 7 * DAY, NOW)).toEqual([]);
    });

    it("skips resetAt < now (already reset)", () => {
        const g = group("claude", [{ periods: [period({ resetAt: NOW - 1000 })] }]);
        expect(collect_upcoming_resets([g], 7 * DAY, NOW)).toEqual([]);
    });

    it("collects all metrics of a multi-metric account", () => {
        const g = group("claude", [
            {
                periods: [
                    period({ raw_label: "5小时", resetAt: NOW + 1 * DAY }),
                    period({ raw_label: "一周", resetAt: NOW + 4 * DAY }),
                ],
            },
        ]);
        const result = collect_upcoming_resets([g], 7 * DAY, NOW);
        expect(result).toHaveLength(2);
        expect(result.map((r) => r.metricLabel)).toEqual(["5小时", "一周"]);
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
        const result = collect_upcoming_resets([g], 7 * DAY, NOW);
        expect(result.map((r) => r.resetAt)).toEqual([NOW + 1 * DAY, NOW + 3 * DAY, NOW + 5 * DAY]);
    });

    it("computes percent as used/limit clamped 0-100 for ratio displayStyle", () => {
        const g = group("deepseek", [
            {
                periods: [
                    period({
                        used: 5,
                        limit: 8,
                        displayStyle: "ratio",
                        resetAt: NOW + 1 * DAY,
                    }),
                    period({
                        used: 12,
                        limit: 10,
                        displayStyle: "ratio",
                        resetAt: NOW + 2 * DAY,
                    }),
                ],
            },
        ]);
        const result = collect_upcoming_resets([g], 7 * DAY, NOW);
        expect(result[0]?.percent).toBe(63); // 5/8 = 62.5 -> round 63
        expect(result[1]?.percent).toBe(100); // clamp 120 -> 100
    });

    it("reports percent 0 when used/limit invalid (null or zero limit)", () => {
        const g = group("claude", [
            {
                periods: [
                    period({ used: null, limit: 100, resetAt: NOW + 1 * DAY }),
                    period({ used: 50, limit: 0, resetAt: NOW + 2 * DAY }),
                    period({ used: null, limit: null, resetAt: NOW + 3 * DAY }),
                ],
            },
        ]);
        const result = collect_upcoming_resets([g], 7 * DAY, NOW);
        expect(result.map((r) => r.percent)).toEqual([0, 0, 0]);
    });

    it("flattens across providers and accounts", () => {
        const g1 = group("claude", [{ periods: [period({ resetAt: NOW + 2 * DAY })] }]);
        const g2 = group("kimi", [
            { periods: [period({ provider: "kimi", resetAt: NOW + 1 * DAY })] },
        ]);
        const result = collect_upcoming_resets([g1, g2], 7 * DAY, NOW);
        expect(result.map((r) => r.provider)).toEqual(["kimi", "claude"]);
    });
});

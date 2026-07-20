import { describe, expect, it } from "vitest";
import type {
    ProviderUsageGroup,
    ProviderUsagePeriod,
} from "../../src/renderer/lib/provider-usage";
import { buildAccountErrors } from "../../src/renderer/lib/provider-usage";

function make_group(overrides?: {
    accountErrors?: { accountId: string; error: string }[];
}): ProviderUsageGroup {
    const errors = overrides?.accountErrors ?? [];
    const error_set = new Map(errors.map((e) => [e.accountId, e.error]));
    return {
        provider: "claude",
        label: "Claude",
        accountCount: 2,
        status: "normal",
        updatedAt: "2026-01-01T00:00:00Z",
        observedAt: Date.now(),
        source: "local",
        stale: false,
        periods: [
            {
                id: "p1",
                provider: "claude",
                source: "local",
                sourceInstanceId: "inst1",
                connectorInstanceId: "conn1",
                connectorDisplayName: "Claude",
                accountId: "acc1",
                accountLabel: "Primary",
                raw_label: "daily",
                name: "daily",
                used: 50,
                limit: 100,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
                updatedAt: "2026-01-01T00:00:00Z",
                observedAt: Date.now(),
                stale: false,
                error: error_set.get("acc1"),
            },
            {
                id: "p2",
                provider: "claude",
                source: "local",
                sourceInstanceId: "inst1",
                connectorInstanceId: "conn1",
                connectorDisplayName: "Claude",
                accountId: "acc2",
                accountLabel: "Secondary",
                raw_label: "hourly",
                name: "hourly",
                used: 10,
                limit: 50,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
                updatedAt: "2026-01-01T00:00:00Z",
                observedAt: Date.now(),
                stale: false,
                error: error_set.get("acc2"),
            },
        ],
        accounts: [
            {
                id: "inst1|acc1",
                sourceInstanceId: "inst1",
                accountId: "acc1",
                accountLabel: "Primary",
                status: "normal",
                updatedAt: "2026-01-01T00:00:00Z",
                observedAt: Date.now(),
                stale: false,
                periods: [
                    {
                        id: "p1",
                        provider: "claude",
                        source: "local",
                        sourceInstanceId: "inst1",
                        connectorInstanceId: "conn1",
                        connectorDisplayName: "Claude",
                        accountId: "acc1",
                        accountLabel: "Primary",
                        raw_label: "daily",
                        name: "daily",
                        used: 50,
                        limit: 100,
                        displayStyle: "percent",
                        resetAt: null,
                        status: "normal",
                        updatedAt: "2026-01-01T00:00:00Z",
                        observedAt: Date.now(),
                        stale: false,
                        error: error_set.get("acc1"),
                    },
                ],
            },
            {
                id: "inst1|acc2",
                sourceInstanceId: "inst1",
                accountId: "acc2",
                accountLabel: "Secondary",
                status: "normal",
                updatedAt: "2026-01-01T00:00:00Z",
                observedAt: Date.now(),
                stale: false,
                periods: [
                    {
                        id: "p2",
                        provider: "claude",
                        source: "local",
                        sourceInstanceId: "inst1",
                        connectorInstanceId: "conn1",
                        connectorDisplayName: "Claude",
                        accountId: "acc2",
                        accountLabel: "Secondary",
                        raw_label: "hourly",
                        name: "hourly",
                        used: 10,
                        limit: 50,
                        displayStyle: "percent",
                        resetAt: null,
                        status: "normal",
                        updatedAt: "2026-01-01T00:00:00Z",
                        observedAt: Date.now(),
                        stale: false,
                        error: error_set.get("acc2"),
                    },
                ],
            },
        ],
    };
}

describe("buildAccountErrors", () => {
    it("extracts errors from accounts with MetricRecord.error", () => {
        const groups = [
            make_group({ accountErrors: [{ accountId: "acc1", error: "API key expired" }] }),
        ];
        const result = buildAccountErrors(groups);
        expect(result.size).toBe(1);
        expect(result.get("inst1|acc1")).toEqual({
            provider: "claude",
            accountLabel: "Primary",
            error: "API key expired",
        });
    });

    it("returns empty map when no accounts have errors", () => {
        const groups = [make_group()];
        const result = buildAccountErrors(groups);
        expect(result.size).toBe(0);
    });

    it("captures first error per account only", () => {
        const group = make_group({
            accountErrors: [
                { accountId: "acc1", error: "first error" },
                { accountId: "acc2", error: "second error" },
            ],
        });
        const result = buildAccountErrors([group]);
        expect(result.size).toBe(2);
        expect(result.get("inst1|acc1")?.error).toBe("first error");
        expect(result.get("inst1|acc2")?.error).toBe("second error");
    });

    it("extracts error from second period when first has no error (multi-period account)", () => {
        // account with 2 periods: first ok (no error), second error → extracts second's error
        const ok_period: ProviderUsagePeriod = {
            id: "p1ok",
            provider: "claude",
            source: "local",
            sourceInstanceId: "inst1",
            connectorInstanceId: "conn1",
            connectorDisplayName: "Claude",
            accountId: "acc1",
            accountLabel: "Primary",
            raw_label: "daily",
            name: "daily",
            used: 50,
            limit: 100,
            displayStyle: "percent",
            resetAt: null,
            status: "normal",
            updatedAt: "2026-01-01T00:00:00Z",
            observedAt: Date.now(),
            stale: false,
            error: undefined,
        };
        const err_period: ProviderUsagePeriod = {
            ...ok_period,
            id: "p2err",
            raw_label: "hourly",
            name: "hourly",
            error: "quota exceeded",
            status: "unknown",
        };
        const group: ProviderUsageGroup = {
            provider: "claude",
            label: "Claude",
            accountCount: 1,
            status: "normal",
            updatedAt: "2026-01-01T00:00:00Z",
            observedAt: Date.now(),
            source: "local",
            stale: false,
            periods: [ok_period, err_period],
            accounts: [
                {
                    id: "inst1|acc1",
                    sourceInstanceId: "inst1",
                    accountId: "acc1",
                    accountLabel: "Primary",
                    status: "normal",
                    updatedAt: "2026-01-01T00:00:00Z",
                    observedAt: Date.now(),
                    stale: false,
                    periods: [ok_period, err_period],
                },
            ],
        };
        const result = buildAccountErrors([group]);
        expect(result.size).toBe(1);
        expect(result.get("inst1|acc1")?.error).toBe("quota exceeded");
    });

    it("works across multiple groups", () => {
        const g1 = make_group({
            accountErrors: [{ accountId: "acc1", error: "g1 error" }],
        });
        const ds_period: ProviderUsagePeriod = {
            id: "p3",
            provider: "deepseek",
            source: "local",
            sourceInstanceId: "inst2",
            connectorInstanceId: "conn2",
            connectorDisplayName: "DeepSeek",
            accountId: "acc3",
            accountLabel: "DS Account",
            raw_label: "daily",
            name: "daily",
            used: 20,
            limit: 100,
            displayStyle: "percent",
            resetAt: null,
            status: "normal",
            updatedAt: "2026-01-01T00:00:00Z",
            observedAt: Date.now(),
            stale: false,
            error: "rate limited",
        };
        const g2: ProviderUsageGroup = {
            provider: "deepseek",
            label: "DeepSeek",
            accountCount: 1,
            status: "normal",
            updatedAt: "2026-01-01T00:00:00Z",
            observedAt: Date.now(),
            source: "local",
            stale: false,
            accounts: [
                {
                    id: "inst2|acc3",
                    sourceInstanceId: "inst2",
                    accountId: "acc3",
                    accountLabel: "DS Account",
                    status: "normal",
                    updatedAt: "2026-01-01T00:00:00Z",
                    observedAt: Date.now(),
                    stale: false,
                    periods: [ds_period],
                },
            ],
            periods: [ds_period],
        };
        const result = buildAccountErrors([g1, g2]);
        expect(result.size).toBe(2);
        expect(result.get("inst1|acc1")?.provider).toBe("claude");
        expect(result.get("inst2|acc3")?.provider).toBe("deepseek");
        expect(result.get("inst2|acc3")?.error).toBe("rate limited");
    });

    it("handles empty groups array", () => {
        const result = buildAccountErrors([]);
        expect(result.size).toBe(0);
    });
});

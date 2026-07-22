import { describe, expect, it } from "vitest";
import {
    build_label_map_rows,
    type LabelMapRow,
} from "../../../../src/renderer/lib/label-map-util";
import type { MetricRecord } from "../../../../src/shared/schemas/plugin-output";

function metric(
    partial: Pick<MetricRecord, "raw_label" | "normalized_label"> & Partial<MetricRecord>,
): MetricRecord {
    return {
        id: partial.id ?? `id-${partial.raw_label}`,
        provider: partial.provider ?? "claude",
        source: partial.source ?? "poll",
        sourceInstanceId: partial.sourceInstanceId ?? "inst-1",
        accountId: partial.accountId ?? "acc-1",
        accountLabel: partial.accountLabel ?? "Account",
        raw_label: partial.raw_label,
        normalized_label: partial.normalized_label,
        used: partial.used ?? 1,
        limit: partial.limit ?? 100,
        resetAt: partial.resetAt ?? null,
        observedAt: partial.observedAt ?? 1,
        stale: partial.stale ?? false,
        displayStyle: partial.displayStyle ?? "percent",
        status: partial.status ?? "normal",
    };
}

describe("build_label_map_rows", () => {
    it("uses item.raw_label as the row key (never normalized_label)", () => {
        const rows = build_label_map_rows([
            metric({ raw_label: "five_hour", normalized_label: "5小时" }),
            metric({ raw_label: "seven_day", normalized_label: "一周" }),
        ]);

        expect(rows.map((r) => r.raw)).toEqual(["five_hour", "seven_day"]);
        expect(rows[0]?.raw).toBe("five_hour");
        expect(rows[0]?.default).toBe("5小时");
        expect(rows[0]?.display).toBe("5小时");
        expect(rows[1]).toEqual({
            raw: "seven_day",
            default: "一周",
            display: "一周",
            account_keys: ["inst-1|acc-1"],
        } satisfies LabelMapRow);
    });

    it("applies existing_map by raw_label, not by normalized_label", () => {
        const rows = build_label_map_rows(
            [metric({ raw_label: "five_hour", normalized_label: "5小时" })],
            { five_hour: "自定义五小时", "5小时": "不该命中" },
        );

        expect(rows).toEqual([
            {
                raw: "five_hour",
                default: "5小时",
                display: "自定义五小时",
                account_keys: ["inst-1|acc-1"],
            },
        ]);
    });

    it("de-duplicates by raw_label (first occurrence wins)", () => {
        const rows = build_label_map_rows([
            metric({
                raw_label: "primary_window",
                normalized_label: "5小时",
                accountId: "acc-a",
                accountLabel: "Account A",
            }),
            metric({
                raw_label: "primary_window",
                normalized_label: "5小时",
                accountId: "acc-b",
                accountLabel: "Account B",
            }),
            metric({
                raw_label: "secondary_window",
                normalized_label: "一周",
                accountId: "acc-b",
                accountLabel: "Account B",
            }),
        ]);

        expect(rows).toHaveLength(2);
        expect(rows.map((r) => r.raw)).toEqual(["primary_window", "secondary_window"]);
    });

    it("merges distinct account_keys per raw_label (gateway keys by label)", () => {
        const rows = build_label_map_rows([
            metric({
                raw_label: "primary_window",
                normalized_label: "5小时",
                source: "gateway",
                sourceInstanceId: "cpa-1",
                accountId: "id-a",
                accountLabel: "Account A",
            }),
            metric({
                raw_label: "primary_window",
                normalized_label: "5小时",
                source: "gateway",
                sourceInstanceId: "cpa-1",
                accountId: "id-b",
                accountLabel: "Account B",
            }),
            metric({
                raw_label: "primary_window",
                normalized_label: "5小时",
                source: "poll",
                sourceInstanceId: "inst-1",
                accountId: "acc-1",
                accountLabel: "Account A",
            }),
        ]);

        const row = rows.find((r) => r.raw === "primary_window");
        expect(row?.account_keys).toEqual([
            "cpa-1|label|Account A",
            "cpa-1|label|Account B",
            "inst-1|acc-1",
        ]);
    });

    it("uses normalize_for_display as display fallback without changing the key", () => {
        const rows = build_label_map_rows(
            [
                metric({
                    raw_label: "primary_window",
                    normalized_label: "Codex (Account A) · 5小时",
                    accountLabel: "Account A",
                }),
            ],
            undefined,
            (item) => item.normalized_label.replace(/\s*\(Account A\)/, ""),
        );

        expect(rows).toEqual([
            {
                raw: "primary_window",
                default: "Codex · 5小时",
                display: "Codex · 5小时",
                account_keys: ["inst-1|acc-1"],
            },
        ]);
    });

    it("prefers existing_map over normalize_for_display fallback", () => {
        const rows = build_label_map_rows(
            [metric({ raw_label: "five_hour", normalized_label: "5小时" })],
            { five_hour: "用户映射" },
            () => "规范化默认",
        );

        expect(rows[0]?.display).toBe("用户映射");
        expect(rows[0]?.default).toBe("规范化默认");
        expect(rows[0]?.raw).toBe("five_hour");
    });

    it("returns empty array for empty items", () => {
        expect(build_label_map_rows([])).toEqual([]);
    });

    it("dedupes account_keys when the same account repeats a raw_label", () => {
        const rows = build_label_map_rows([
            metric({ raw_label: "five_hour", normalized_label: "5小时", accountId: "acc-a" }),
            metric({ raw_label: "five_hour", normalized_label: "5小时", accountId: "acc-a" }),
        ]);

        expect(rows[0]?.account_keys).toEqual(["inst-1|acc-a"]);
    });
});

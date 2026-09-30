import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ProviderAccountList } from "../../../../src/renderer/components/ProviderAccountList";
import { build_provider_usage_groups } from "../../../../src/renderer/lib/provider-usage";
import type { MetricRecord } from "../../../../src/shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";

// t537 AC-004：多服务账号在用量面板（与弹窗共用同一 builder/组件）展示
// 可区分的服务名与各自用量。

function service_item(
    service_id: string,
    label: string,
    used: number,
    limit: number,
    reset_at: number,
): MetricRecord {
    return {
        id: `flowercloud:traffic:${service_id}`,
        metric_id: "flowercloud:traffic",
        provider: "flowercloud",
        source: "session",
        sourceInstanceId: "flowercloud-main",
        accountId: `flowercloud_service_${service_id}`,
        accountLabel: label,
        raw_label: "monthly_traffic",
        normalized_label: "月流量",
        used,
        limit,
        displayStyle: "ratio",
        resetAt: reset_at,
        status: "normal",
        observedAt: 1735689600000,
        stale: false,
    };
}

function flowercloud_connector(items: readonly MetricRecord[]): ConnectorInfo {
    return {
        instanceId: "flowercloud-connector",
        sourceInstanceId: "flowercloud-main",
        stateId: "flowercloud-connector",
        name: "flowercloud-connector",
        // 实例备注 ≠ name：单账号实例备注会覆盖服务名；多账号（本例 2 服务）必须回退。
        displayName: "我的花云",
        enabled: true,
        source: "poll",
        supportedProviders: ["flowercloud"],
        activeProviders: ["flowercloud"],
        metadata: null,
        snapshot: {
            status: "ready",
            items: [...items],
            updatedAt: "2026-01-01T00:00:00Z",
        },
    };
}

describe("t537 AC-004 flowercloud multi-service display", () => {
    const items = [
        service_item(
            "8848",
            "Global Acceleration Lite",
            34.56,
            150,
            Date.parse("2026-10-18T00:00:00+08:00"),
        ),
        service_item(
            "8849",
            "Global Acceleration Plus",
            77.1,
            400,
            Date.parse("2026-11-05T00:00:00+08:00"),
        ),
    ];

    it("groups each service into its own account row", () => {
        const groups = build_provider_usage_groups([flowercloud_connector(items)]);
        const group = groups.find((entry) => entry.provider === "flowercloud");

        expect(group).toBeDefined();
        expect(group?.accounts).toHaveLength(2);
        expect(group?.accounts.map((account) => account.accountLabel)).toEqual([
            "Global Acceleration Lite",
            "Global Acceleration Plus",
        ]);
        expect(group?.accounts.map((account) => account.accountId)).toEqual([
            "flowercloud_service_8848",
            "flowercloud_service_8849",
        ]);
    });

    it("falls back to service names even when the instance remark is truncated (t537 gen_f002)", () => {
        // 备注超 64 字符被 sanitize 截断：回退判定不能拿清洗后的 accountLabel
        // 反比原始 displayName，否则多服务行标签会退化成同一条截断备注。
        const connector = flowercloud_connector(items);
        const long_remark = "备注".repeat(40);
        const groups = build_provider_usage_groups([{ ...connector, displayName: long_remark }]);
        const group = groups.find((entry) => entry.provider === "flowercloud");

        expect(group?.accounts.map((account) => account.accountLabel)).toEqual([
            "Global Acceleration Lite",
            "Global Acceleration Plus",
        ]);
    });

    it("keeps the fallback label sanitized (t537 gen_f005)", () => {
        // 采集层账号名带控制字符/首尾空白：回退值必须与无覆盖路径同走 sanitize
        //（64 字符上限 + 控制字符过滤），不能把原始串直接写回展示层。
        const dirty_items = [
            service_item("8848", "  Global\u0001 Acceleration Lite  ", 34.56, 150, 0),
            service_item("8849", "Global Acceleration Plus\n", 77.1, 400, 0),
        ];
        const groups = build_provider_usage_groups([
            { ...flowercloud_connector(dirty_items), displayName: "我的花云" },
        ]);
        const group = groups.find((entry) => entry.provider === "flowercloud");

        expect(group?.accounts.map((account) => account.accountLabel)).toEqual([
            "Global Acceleration Lite",
            "Global Acceleration Plus",
        ]);
    });

    it("renders distinguishable service names and per-service usage", () => {
        const groups = build_provider_usage_groups([flowercloud_connector(items)]);
        const group = groups.find((entry) => entry.provider === "flowercloud");
        if (!group) throw new Error("flowercloud group missing");

        render(<ProviderAccountList group={group} />);

        expect(screen.getByText("Global Acceleration Lite")).toBeInTheDocument();
        expect(screen.getByText("Global Acceleration Plus")).toBeInTheDocument();
        // ratio 展示为 `used/limit`，两个服务各自独立的用量值可读。
        expect(screen.getByText("34.56/150")).toBeInTheDocument();
        expect(screen.getByText("77.1/400")).toBeInTheDocument();
        expect(screen.getAllByText("月流量")).toHaveLength(2);
        // 套餐刷新时间（reset_at → bar-reset/bar-clock）对 ratio 行可见。
        const reset_cells = screen.getAllByTestId("bar-reset");
        const clock_cells = screen.getAllByTestId("bar-clock");
        expect(reset_cells).toHaveLength(2);
        expect(reset_cells.every((cell) => cell.textContent.trim() !== "")).toBe(true);
        expect(clock_cells.every((cell) => cell.textContent.trim() !== "")).toBe(true);
    });
});

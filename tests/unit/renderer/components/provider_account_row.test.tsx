import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ProviderAccountRow } from "../../../../src/renderer/components/ProviderAccountRow";
import type { ProviderUsageAccount } from "../../../../src/renderer/lib/provider-usage";

function make_account(overrides: Partial<ProviderUsageAccount> = {}): ProviderUsageAccount {
    return {
        id: "cpa-main:label:Account A",
        sourceInstanceId: "cpa-main",
        accountId: "auth-a",
        accountLabel: "Account A",
        status: "normal",
        updatedAt: "2026-01-01T12:00:00Z",
        observedAt: 1735689600000,
        stale: false,
        periods: [
            {
                id: "claude-a-5h",
                metric_id: "claude:auth-a:5h",
                provider: "claude",
                source: "gateway",
                sourceInstanceId: "cpa-main",
                connectorInstanceId: "cpa-connector",
                connectorDisplayName: "CPA",
                accountId: "auth-a",
                accountLabel: "Account A",
                raw_label: "5h",
                name: "Claude Pro · 5小时",
                used: 10,
                limit: 100,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
                updatedAt: "2026-01-01T12:00:00Z",
                observedAt: 1735689600000,
                stale: false,
            },
        ],
        ...overrides,
    };
}

describe("ProviderAccountRow", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("shows update time instead of period count", () => {
        const { container } = render(<ProviderAccountRow account={make_account()} />);

        expect(screen.queryByText(/个周期/)).not.toBeInTheDocument();
        expect(container.querySelector(".rel-time")?.textContent).not.toBe("");
    });

    it("shows the data time (observedAt), not connector-level updatedAt, for stale accounts (t174)", () => {
        // t174: stale 副本保留原数据时间后，账号行相对时间必须取自 per-账号
        // observedAt（原数据时间）而非 connector 级 updatedAt（本次尝试时间，
        // 部分失败下会被成功账号拉高）。
        const old_epoch = Date.now() - 3 * 86400000;
        const recent_iso = new Date().toISOString();
        const { container } = render(
            <ProviderAccountRow
                account={make_account({
                    stale: true,
                    observedAt: old_epoch,
                    updatedAt: recent_iso,
                })}
            />,
        );
        const rel_time = container.querySelector(".rel-time")?.textContent ?? "";
        // 基于 observedAt：约 3 天前
        expect(rel_time).toContain("天前");
        // 不得基于 updatedAt（刚刚）显示
        expect(rel_time).not.toContain("刚刚");
        expect(rel_time).not.toContain("分钟前");
        // stale 徽标仍在
        expect(rel_time).toContain("已过期");
    });

    it("does not show account menu (edit removed from main panel)", () => {
        render(<ProviderAccountRow account={make_account()} />);

        expect(screen.queryByLabelText("账号操作")).not.toBeInTheDocument();
        expect(screen.queryByText("编辑")).not.toBeInTheDocument();
    });

    it("marks stale accounts", () => {
        const { container } = render(
            <ProviderAccountRow account={make_account({ stale: true })} />,
        );

        expect(screen.getByText("已过期")).toBeInTheDocument();
        expect(container.querySelector(".card.stale")).not.toBeInTheDocument();
    });

    it("hides account label when desensitizeRemarks is on", () => {
        render(<ProviderAccountRow account={make_account()} desensitizeRemarks />);
        expect(screen.queryByText("Account A")).not.toBeInTheDocument();
    });

    it("shows account label when desensitizeRemarks is off", () => {
        render(<ProviderAccountRow account={make_account()} desensitizeRemarks={false} />);
        expect(screen.getByText("Account A")).toBeInTheDocument();
    });

    it("card has .card class and no status-specific class when critical", () => {
        const account = make_account({
            status: "critical",
        });
        const { container } = render(<ProviderAccountRow account={account} />);
        expect(container.querySelector(".card")).toBeInTheDocument();
        expect(container.querySelector(".card--critical")).not.toBeInTheDocument();
    });

    // t158: per-account re-login entry — independent from the overview-level
    // re-login button so multi-instance 401 can target the specific failing account.
    describe("t158 per-account re-login", () => {
        it("shows account-row 重新登录 link for a 401 error", () => {
            const onReLogin = vi.fn();
            const account = make_account({
                sourceInstanceId: "cpa-main",
                accountId: "auth-a",
            });
            render(
                <ProviderAccountRow
                    account={account}
                    provider="claude"
                    error="HTTP 401: request failed (37 bytes)"
                    onReLogin={onReLogin}
                />,
            );
            // row-level link present (scope: account row only, not header-of-card)
            const link = screen.getByRole("button", { name: /重新登录/ });
            expect(link).toBeInTheDocument();
            fireEvent.click(link);
            expect(onReLogin).toHaveBeenCalledWith("cpa-main", "auth-a", "claude");
        });

        it("does not show re-login link for a connection timeout", () => {
            const onReLogin = vi.fn();
            render(
                <ProviderAccountRow
                    account={make_account()}
                    provider="grok"
                    error="request failed: ETIMEDOUT"
                    onReLogin={onReLogin}
                />,
            );
            expect(screen.queryByRole("button", { name: /重新登录/ })).not.toBeInTheDocument();
        });

        it("does not show re-login link when error is absent", () => {
            const onReLogin = vi.fn();
            render(
                <ProviderAccountRow
                    account={make_account()}
                    provider="claude"
                    onReLogin={onReLogin}
                />,
            );
            expect(screen.queryByRole("button", { name: /重新登录/ })).not.toBeInTheDocument();
        });

        it("does not show re-login link when onReLogin is not provided", () => {
            render(
                <ProviderAccountRow account={make_account()} provider="claude" error="HTTP 401" />,
            );
            expect(screen.queryByRole("button", { name: /重新登录/ })).not.toBeInTheDocument();
        });
    });

    describe("trend sparkline integration", () => {
        it("fetches trend data on expand via getBulk and renders sparkline (t196 AC5)", async () => {
            const trend_bulk = vi.fn().mockResolvedValue({
                series: [
                    {
                        metric_id: "claude:auth-a:5h",
                        series: [
                            { date: "2026-07-14", percent: 10 },
                            { date: "2026-07-15", percent: 20 },
                            { date: "2026-07-16", percent: 30 },
                        ],
                    },
                ],
            });
            window.usageboard.trend = {
                get: vi.fn().mockResolvedValue([]),
                getBulk: trend_bulk,
            };
            const account = make_account();
            const { container } = render(
                <ProviderAccountRow
                    account={account}
                    collapsed={false}
                    onToggleCollapsed={() => undefined}
                />,
            );
            await waitFor(() => {
                expect(container.querySelector(".trend-svg")).toBeInTheDocument();
            });
            expect(trend_bulk).toHaveBeenCalledTimes(1);
            // bulk 查询键是 period.metric_id（observation 完整键），非 raw_label（p044）；
            // source_instance_id 隔离多账号（t214）
            expect(trend_bulk).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: "claude",
                    account_id: "auth-a",
                    source_instance_id: "cpa-main",
                    periods: [expect.objectContaining({ metric_id: "claude:auth-a:5h" })],
                }),
            );
            expect(container.querySelector(".trend-sparkline-empty")).not.toBeInTheDocument();
        });

        it("fetches all metric periods in a single getBulk call (t196 AC5 N>1)", async () => {
            // t196 AC5: N 个指标周期只发一次 bulk invoke，payload 含全部 metric_id，
            // 响应按 metric_id 映射回各自缓存与 sparkline。
            const trend_bulk = vi.fn().mockResolvedValue({
                series: [
                    {
                        metric_id: "claude:auth-a:5h",
                        series: [
                            { date: "2026-07-14", percent: 10 },
                            { date: "2026-07-15", percent: 20 },
                        ],
                    },
                    {
                        metric_id: "claude:auth-a:5d",
                        series: [
                            { date: "2026-07-14", percent: 30 },
                            { date: "2026-07-15", percent: 40 },
                        ],
                    },
                ],
            });
            window.usageboard.trend = {
                get: vi.fn().mockResolvedValue([]),
                getBulk: trend_bulk,
            };
            const first_period = make_account().periods[0];
            if (!first_period) throw new Error("expected at least one period");
            const period_5h = first_period;
            const account = make_account({
                periods: [
                    period_5h,
                    {
                        ...period_5h,
                        id: "claude-a-5d",
                        metric_id: "claude:auth-a:5d",
                        raw_label: "5d",
                        name: "Claude Pro · 5天",
                    },
                ],
            });
            const { container } = render(
                <ProviderAccountRow
                    account={account}
                    collapsed={false}
                    onToggleCollapsed={() => undefined}
                />,
            );
            await waitFor(() => {
                expect(trend_bulk).toHaveBeenCalledTimes(1);
            });
            // 单次 invoke 携带全部周期；不因 N 周期发 N 次。
            expect(trend_bulk).toHaveBeenCalledTimes(1);
            expect(trend_bulk).toHaveBeenCalledWith(
                expect.objectContaining({
                    provider: "claude",
                    account_id: "auth-a",
                    source_instance_id: "cpa-main",
                    periods: [
                        expect.objectContaining({ metric_id: "claude:auth-a:5h" }),
                        expect.objectContaining({ metric_id: "claude:auth-a:5d" }),
                    ],
                }),
            );
            await waitFor(() => {
                expect(container.querySelectorAll(".trend-svg").length).toBe(2);
            });
            expect(container.querySelector(".trend-sparkline-empty")).not.toBeInTheDocument();
        });

        it("does not re-fetch on collapse/re-expand (cache hit)", async () => {
            const trend_bulk = vi.fn().mockResolvedValue({
                series: [
                    {
                        metric_id: "claude:auth-a:5h",
                        series: [
                            { date: "2026-07-14", percent: 10 },
                            { date: "2026-07-15", percent: 20 },
                        ],
                    },
                ],
            });
            window.usageboard.trend = {
                get: vi.fn().mockResolvedValue([]),
                getBulk: trend_bulk,
            };
            const account = make_account();
            const { container, rerender } = render(
                <ProviderAccountRow
                    account={account}
                    collapsed={false}
                    onToggleCollapsed={() => undefined}
                />,
            );
            await waitFor(() => {
                expect(trend_bulk).toHaveBeenCalledTimes(1);
            });
            // Collapse.
            rerender(
                <ProviderAccountRow
                    account={account}
                    collapsed={true}
                    onToggleCollapsed={() => undefined}
                />,
            );
            // Re-expand - cache should hit, no new IPC call.
            rerender(
                <ProviderAccountRow
                    account={account}
                    collapsed={false}
                    onToggleCollapsed={() => undefined}
                />,
            );
            await waitFor(() => {
                expect(container.querySelector(".trend-svg")).toBeInTheDocument();
            });
            expect(trend_bulk).toHaveBeenCalledTimes(1);
        });

        it("shows placeholder and does not cache when trend.getBulk rejects", async () => {
            const trend_bulk = vi.fn().mockRejectedValue(new Error("IPC failed"));
            window.usageboard.trend = {
                get: vi.fn().mockResolvedValue([]),
                getBulk: trend_bulk,
            };
            const account = make_account();
            const { container, rerender } = render(
                <ProviderAccountRow
                    account={account}
                    collapsed={false}
                    onToggleCollapsed={() => undefined}
                />,
            );
            await waitFor(() => {
                expect(trend_bulk).toHaveBeenCalledTimes(1);
            });
            // Failure branch: placeholder shown, not cached.
            expect(container.querySelector(".trend-sparkline-empty")).toBeInTheDocument();
            // Collapse and re-expand - without cache, getBulk is called again.
            rerender(
                <ProviderAccountRow
                    account={account}
                    collapsed={true}
                    onToggleCollapsed={() => undefined}
                />,
            );
            rerender(
                <ProviderAccountRow
                    account={account}
                    collapsed={false}
                    onToggleCollapsed={() => undefined}
                />,
            );
            await waitFor(() => {
                expect(trend_bulk).toHaveBeenCalledTimes(2);
            });
        });

        it("窗口选择器切换 days 触发新取数，切回走缓存 (t208)", async () => {
            const trend_bulk = vi.fn().mockResolvedValue({
                series: [
                    {
                        metric_id: "claude:auth-a:5h",
                        series: [
                            { date: "2026-07-14", percent: 10 },
                            { date: "2026-07-15", percent: 20 },
                        ],
                    },
                ],
            });
            window.usageboard.trend = {
                get: vi.fn().mockResolvedValue([]),
                getBulk: trend_bulk,
            };
            const account = make_account();
            const { container } = render(
                <ProviderAccountRow
                    account={account}
                    collapsed={false}
                    onToggleCollapsed={() => undefined}
                />,
            );
            // 默认 7 天，初次取数
            await waitFor(() => {
                expect(trend_bulk).toHaveBeenCalledTimes(1);
            });
            expect(trend_bulk).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    periods: [expect.objectContaining({ metric_id: "claude:auth-a:5h", days: 7 })],
                }),
            );
            // 切到 1 天
            const buttons = container.querySelectorAll(".trend-window-btn");
            const one_day_btn = Array.from(buttons).find((b) => b.textContent === "1天");
            expect(one_day_btn).toBeDefined();
            if (!one_day_btn) throw new Error("no 1d btn");
            fireEvent.click(one_day_btn);
            await waitFor(() => {
                expect(trend_bulk).toHaveBeenCalledTimes(2);
            });
            expect(trend_bulk).toHaveBeenLastCalledWith(
                expect.objectContaining({
                    periods: [expect.objectContaining({ days: 1 })],
                }),
            );
            // 切回 7 天：缓存命中，不重发 IPC
            const seven_day_btn = Array.from(buttons).find((b) => b.textContent === "7天");
            expect(seven_day_btn).toBeDefined();
            if (!seven_day_btn) throw new Error("no 7d btn");
            fireEvent.click(seven_day_btn);
            // 短暂等待确认无新调用
            await new Promise((resolve) => setTimeout(resolve, 50));
            expect(trend_bulk).toHaveBeenCalledTimes(2);
        });
    });
});

import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import { build_overview_for_group } from "../../../../src/renderer/lib/provider-usage";
import { makeGroup, makePeriod, setupWindowUsageboard } from "./provider_card_fixture";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("ProviderCard - overview", () => {
    beforeEach(() => {
        setupWindowUsageboard();
    });

    it("shows count badge for multi-account providers", () => {
        const group = makeGroup({ accountCount: 3 });
        render(<ProviderCard provider="deepseek" group={group} expanded={false} />);
        expect(screen.getByText("3账号")).toBeInTheDocument();
    });

    it("shows L2 segmented control for multi-account when expanded", () => {
        const group = makeGroup({ accountCount: 3 });
        render(
            <ProviderCard provider="deepseek" group={group} expanded onToggleExpand={vi.fn()} />,
        );
        expect(screen.getByText("概览")).toBeInTheDocument();
        expect(screen.getByText("3账号")).toBeInTheDocument();
    });

    it("renders overview rows by default for expanded multi-account providers", () => {
        const group = makeGroup({
            accountCount: 2,
            periods: [
                makePeriod({ id: "w1", accountId: "a1", used: 50, limit: 100 }),
                makePeriod({ id: "w2", accountId: "a2", used: 100, limit: 300 }),
            ],
        });

        render(
            <ProviderCard provider="deepseek" group={group} expanded onToggleExpand={vi.fn()} />,
        );

        expect(screen.getByText("概览")).toBeInTheDocument();
        // ratio mode: aggregated used=150, limit=400
        expect(screen.getByText("150/400")).toBeInTheDocument();
        expect(screen.queryByText("Account 1")).not.toBeInTheDocument();
    });

    it("受控 l2Open 控制概览/明细切换（t250），折叠复位逻辑在父级", () => {
        const group = makeGroup({ accountCount: 2 });
        const on_toggle_l2 = vi.fn();
        const { rerender } = render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={vi.fn()}
                l2Open={false}
                onToggleL2Open={on_toggle_l2}
            />,
        );
        // 点「账号明细」触发父级回调（父级 set l2Open=true 后重渲染）。
        fireEvent.click(screen.getByTitle("账号明细"));
        expect(on_toggle_l2).toHaveBeenCalledWith("deepseek");

        rerender(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={vi.fn()}
                l2Open={true}
                onToggleL2Open={on_toggle_l2}
            />,
        );
        expect(screen.getByText("Account 1")).toBeInTheDocument();

        // 折叠（expanded=false）由父级负责复位 l2Open；此处验证折叠态不显示明细与 l2seg。
        rerender(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded={false}
                onToggleExpand={vi.fn()}
                l2Open={false}
                onToggleL2Open={on_toggle_l2}
            />,
        );
        expect(screen.queryByText("Account 1")).not.toBeInTheDocument();
        expect(screen.queryByTitle("概览")).not.toBeInTheDocument();
        expect(screen.getByText("2账号")).toBeInTheDocument();
    });

    it("t305: l2Open=false 时仅「概览」tab 高亮（互斥选中态）", () => {
        const group = makeGroup({ accountCount: 3 });
        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={vi.fn()}
                l2Open={false}
                onToggleL2Open={vi.fn()}
            />,
        );
        const overview_tab = screen.getByTitle("概览");
        const detail_tab = screen.getByTitle("账号明细");
        // t421: 收敛到 ui/Segmented——选中 surface-window + on-surface，未选中 variant 字色。
        expect(overview_tab.className).toContain("bg-[var(--color-surface-window)]");
        expect(overview_tab.className).toContain("text-[var(--color-on-surface)]");
        expect(overview_tab.getAttribute("aria-pressed")).toBe("true");
        expect(detail_tab.getAttribute("aria-pressed")).toBe("false");
        expect(detail_tab.className).toContain("text-[var(--color-on-surface-variant)]");
        expect(detail_tab.className).not.toContain("bg-[var(--color-surface-window)]");
    });

    it("t305: l2Open=true 时仅「N账号」tab 高亮（互斥选中态）", () => {
        const group = makeGroup({ accountCount: 3 });
        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={vi.fn()}
                l2Open={true}
                onToggleL2Open={vi.fn()}
            />,
        );
        const overview_tab = screen.getByTitle("概览");
        const detail_tab = screen.getByTitle("账号明细");
        // t421: ui/Segmented 选中态（与 t305 互斥高亮语义一致）。
        expect(detail_tab.className).toContain("bg-[var(--color-surface-window)]");
        expect(detail_tab.className).toContain("text-[var(--color-on-surface)]");
        expect(detail_tab.getAttribute("aria-pressed")).toBe("true");
        expect(overview_tab.getAttribute("aria-pressed")).toBe("false");
        expect(overview_tab.className).toContain("text-[var(--color-on-surface-variant)]");
        expect(overview_tab.className).not.toContain("bg-[var(--color-surface-window)]");
    });

    it("renders short usage period labels", () => {
        const periods = [
            makePeriod({ id: "long-5h", name: "5小时", used: 10, limit: 100 }),
            makePeriod({ id: "long-week", name: "一周", used: 20, limit: 100 }),
        ];
        const [account] = makeGroup().accounts;
        const group = makeGroup({
            periods,
            accounts: account ? [{ ...account, periods }] : [],
        });

        render(
            <ProviderCard provider="deepseek" group={group} expanded onToggleExpand={vi.fn()} />,
        );

        expect(screen.getByText("5小时")).toBeInTheDocument();
        expect(screen.getByText("一周")).toBeInTheDocument();
    });

    it("aggregates overview rows by period name", () => {
        const group = makeGroup({
            periods: [
                makePeriod({ id: "a-5h", name: "5小时", used: 10, limit: 100 }),
                makePeriod({ id: "b-5h", name: "5小时", used: 30, limit: 100 }),
            ],
        });

        const overview = build_overview_for_group(group);

        expect(overview).toEqual([
            expect.objectContaining({ name: "5小时", used: 40, limit: 200 }),
        ]);
    });

    it("builds weighted overview by quota period", () => {
        const group = makeGroup({
            periods: [
                makePeriod({ id: "w1", accountId: "a1", used: 50, limit: 100 }),
                makePeriod({ id: "w2", accountId: "a2", used: 100, limit: 300 }),
                makePeriod({ id: "w3", accountId: "a3", name: "一周", used: 20, limit: 100 }),
            ],
        });

        const overview = build_overview_for_group(group);

        expect(overview).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ name: "5小时", percent: 38, used: 150, limit: 400 }),
                expect.objectContaining({ name: "一周", percent: 20, used: 20, limit: 100 }),
            ]),
        );
    });

    it("skips invalid overview quota windows", () => {
        const group = makeGroup({
            periods: [
                makePeriod({ id: "w1", accountId: "a1", used: 10, limit: 0 }),
                makePeriod({ id: "w2", accountId: "a2", used: 0, limit: 0, status: "unknown" }),
            ],
        });

        expect(build_overview_for_group(group)).toEqual([]);
    });

    it("wraps single-account capsule bars in the shared bars container", () => {
        const group = makeGroup({
            periods: [
                makePeriod({ id: "w1", name: "5小时", used: 10, limit: 100 }),
                makePeriod({ id: "w2", name: "一周", used: 90, limit: 100, status: "critical" }),
            ],
            accounts: [
                {
                    id: "a1",
                    sourceInstanceId: "ds-1",
                    accountId: "a1",
                    accountLabel: "A1",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [
                        makePeriod({ id: "w1", name: "5小时", used: 10, limit: 100 }),
                        makePeriod({
                            id: "w2",
                            name: "一周",
                            used: 90,
                            limit: 100,
                            status: "critical",
                        }),
                    ],
                },
            ],
        });

        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={vi.fn()}
                barStyle="capsule"
            />,
        );

        const bars = document.querySelector('[data-testid="usage-bars"]');
        expect(bars).toBeInTheDocument();
        expect(
            bars?.querySelectorAll('[data-testid="bar-row"][data-variant="capsule"]'),
        ).toHaveLength(2);
    });

    it("renders null usage as an empty bar", () => {
        const group = makeGroup({
            periods: [
                makePeriod({
                    id: "empty",
                    name: "5小时",
                    used: null,
                    limit: 100,
                    displayStyle: "percent",
                    resetAt: 1748872800000,
                }),
            ],
            accounts: [
                {
                    id: "a1",
                    sourceInstanceId: "ds-1",
                    accountId: "a1",
                    accountLabel: "A1",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [
                        makePeriod({
                            id: "empty",
                            name: "5小时",
                            used: null,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: 1748872800000,
                        }),
                    ],
                },
            ],
        });

        render(
            <ProviderCard provider="deepseek" group={group} expanded onToggleExpand={vi.fn()} />,
        );

        const row = screen.getByText("5小时").closest('[data-testid="bar-row"]');
        expect(row).toBeInstanceOf(HTMLElement);
        const bar_row = row as HTMLElement;
        const fill = bar_row.querySelector('[data-testid="bar-fill"]');
        expect(fill).toBeInstanceOf(HTMLElement);
        expect((fill as HTMLElement).style.width).toBe("0%");
        expect(bar_row.querySelector('[data-testid="bar-pct"]')).toBeEmptyDOMElement();
        expect(bar_row.querySelector('[data-testid="bar-reset"]')).toBeEmptyDOMElement();
        expect(within(bar_row).queryByText("0%")).not.toBeInTheDocument();
        expect(within(bar_row).queryByText("--")).not.toBeInTheDocument();
    });
});

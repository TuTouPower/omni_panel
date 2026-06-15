import { render, screen, fireEvent, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import {
    build_overview_for_group,
    type ProviderUsageGroup,
    type ProviderUsagePeriod,
} from "../../../../src/renderer/lib/provider-usage";
import { bar_fill_color, usage_color } from "../../../../src/renderer/lib/usage-colors";

function hex_to_rgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
}

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

function makeGroup(overrides: Partial<ProviderUsageGroup> = {}): ProviderUsageGroup {
    return {
        provider: "deepseek",
        label: "DeepSeek",
        accountCount: 1,
        status: "normal",
        updatedAt: "2026-06-02T10:00:00Z",
        observedAt: "2026-06-02T10:00:00Z",
        source: "api_key",
        stale: false,
        periods: [
            {
                id: "w1",
                provider: "deepseek",
                source: "api_key",
                sourceInstanceId: "ds-1",
                connectorInstanceId: "ds-1",
                connectorDisplayName: "DeepSeek",
                accountId: "acc1",
                accountLabel: "Account 1",
                raw_label: "",
                name: "Tokens",
                used: 5000,
                limit: 10000,
                displayStyle: "ratio",
                resetAt: null,
                status: "normal",
                updatedAt: "2026-06-02T10:00:00Z",
                observedAt: "2026-06-02T10:00:00Z",
                stale: false,
            },
        ],
        accounts: [
            {
                id: "acc1",
                sourceInstanceId: "ds-1",
                accountId: "acc1",
                accountLabel: "Account 1",
                status: "normal",
                updatedAt: "2026-06-02T10:00:00Z",
                observedAt: "2026-06-02T10:00:00Z",
                stale: false,
                periods: [
                    {
                        id: "w1",
                        provider: "deepseek",
                        source: "api_key",
                        sourceInstanceId: "ds-1",
                        connectorInstanceId: "ds-1",
                        connectorDisplayName: "DeepSeek",
                        accountId: "acc1",
                        accountLabel: "Account 1",
                        raw_label: "",
                        name: "Tokens",
                        used: 5000,
                        limit: 10000,
                        displayStyle: "ratio",
                        resetAt: null,
                        status: "normal",
                        updatedAt: "2026-06-02T10:00:00Z",
                    },
                ],
            },
        ],
        ...overrides,
    };
}

function makePeriod(overrides: Partial<ProviderUsagePeriod> = {}): ProviderUsagePeriod {
    return {
        id: "w-overview",
        provider: "deepseek",
        source: "api_key",
        sourceInstanceId: "ds-overview",
        connectorInstanceId: "ds-overview",
        connectorDisplayName: "DeepSeek",
        accountId: "acc-overview",
        accountLabel: "Account Overview",
        raw_label: "",
        name: "5小时",
        used: 0,
        limit: 0,
        displayStyle: "ratio",
        resetAt: null,
        status: "normal",
        updatedAt: "2026-06-02T10:00:00Z",
        ...overrides,
    };
}

describe("ProviderCard", () => {
    beforeEach(() => {
        window.usageboard = {
            platform: "win32",
            plugin: {
                list: vi.fn(),
                getState: vi.fn(),
                refresh: vi.fn(),
                refreshAll: vi.fn(),
            },
            config: {
                get: vi.fn().mockResolvedValue({ config: {}, hasSecrets: {} }),
                save: vi.fn().mockResolvedValue(undefined),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(() => vi.fn()),
                onThemeChange: vi.fn(),
                onSettingsNavigate: vi.fn(() => vi.fn()),
                onConfigChange: vi.fn(() => vi.fn()),
            },
            popup: { report_content_height: vi.fn() },
            main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
            settings: { open: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
            log: vi.fn(),
        } as unknown as typeof window.usageboard;
    });

    it("shows relative update time instead of status label", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        // Should show relative time like "刚刚" or "X 分钟前", not "正常"/"预警"
        expect(screen.queryByText("正常")).not.toBeInTheDocument();
        expect(screen.queryByText("预警")).not.toBeInTheDocument();
        // rel-time element should exist
        expect(document.querySelector(".rel-time")).toBeInTheDocument();
    });

    it("shows stale badge without source badge or 观测 prefix", () => {
        const group = makeGroup({
            observedAt: "2026-06-02T09:59:00Z",
            source: "api_key",
            stale: true,
        });
        render(<ProviderCard provider="deepseek" group={group} />);

        expect(screen.queryByText("API_KEY")).not.toBeInTheDocument();
        expect(screen.queryByText(/观测/)).not.toBeInTheDocument();
        expect(document.querySelector(".source-badge")).not.toBeInTheDocument();
        expect(document.querySelector(".stale-badge")).toBeInTheDocument();
        expect(document.querySelector(".card.stale")).toBeInTheDocument();
    });

    it("does not render disabled card state", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        expect(screen.queryByText("已关闭")).not.toBeInTheDocument();
        expect(screen.queryByText("监控已关闭，不再刷新用量")).not.toBeInTheDocument();
    });

    it("shows edit/enable-disable/delete menu items", () => {
        const onToggle = vi.fn();
        render(<ProviderCard provider="deepseek" group={makeGroup()} onToggleDisable={onToggle} />);
        fireEvent.click(screen.getByLabelText("更多操作"));
        expect(screen.getByText("编辑")).toBeInTheDocument();
        expect(screen.getByText("关闭")).toBeInTheDocument();
        expect(screen.queryByText("删除")).not.toBeInTheDocument();
    });

    it("does not render detail button", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} />);
        expect(screen.queryByLabelText(/详情/)).not.toBeInTheDocument();
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

    it("renders short usage period labels", () => {
        const periods = [
            makePeriod({ id: "long-5h", name: "Codex (Work) · 5小时", used: 10, limit: 100 }),
            makePeriod({ id: "long-week", name: "Codex (Work) · 每周", used: 20, limit: 100 }),
            makePeriod({ id: "mcp", name: "GLM MCP 月用量", used: 30, limit: 100 }),
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
        expect(screen.getByText("MCP")).toBeInTheDocument();
        expect(screen.queryByText("Codex (Work) · 5小时")).not.toBeInTheDocument();
    });

    it("aggregates overview rows by short usage period label", () => {
        const group = makeGroup({
            periods: [
                makePeriod({ id: "a-5h", name: "Codex (A) · 5小时", used: 10, limit: 100 }),
                makePeriod({ id: "b-5h", name: "Codex (B) · 5小时", used: 30, limit: 100 }),
            ],
        });

        const overview = build_overview_for_group(group);

        expect(overview).toEqual([
            expect.objectContaining({ name: "5小时", used: 40, limit: 200 }),
        ]);
    });

    it("shows auth error with login action", () => {
        render(
            <ProviderCard
                provider="deepseek"
                connectorError={{ displayName: "DeepSeek", error: "unauthorized access" }}
            />,
        );
        expect(screen.getByText("凭证失效，请重新登录")).toBeInTheDocument();
        expect(screen.getByText("重新登录")).toBeInTheDocument();
    });

    it("shows network error with retry action", () => {
        const onRefresh = vi.fn();
        render(
            <ProviderCard
                provider="deepseek"
                connectorError={{ displayName: "DeepSeek", error: "网络超时" }}
                onRefresh={onRefresh}
            />,
        );
        expect(screen.getByText("网络超时")).toBeInTheDocument();
        fireEvent.click(screen.getByText("重试"));
        expect(onRefresh).toHaveBeenCalledWith("deepseek");
    });

    it("applies dragging and drag-over CSS classes", () => {
        const { container } = render(
            <ProviderCard provider="deepseek" group={makeGroup()} dragging />,
        );
        expect(container.querySelector(".card.dragging")).toBeInTheDocument();
    });

    it("renders grip handle when onDragStart is provided", () => {
        render(<ProviderCard provider="deepseek" group={makeGroup()} onDragStart={vi.fn()} />);
        expect(screen.getByTitle("拖动以调整顺序")).toBeInTheDocument();
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

    it("assigns bar colors by position index, not by period type", () => {
        const group = makeGroup({
            accountCount: 3,
            periods: [
                makePeriod({ id: "w1", accountId: "a1", name: "一周", used: 10, limit: 100 }),
                makePeriod({ id: "w2", accountId: "a2", name: "5小时", used: 20, limit: 100 }),
                makePeriod({ id: "w3", accountId: "a3", name: "一周", used: 30, limit: 100 }),
            ],
            accounts: [
                {
                    id: "a1",
                    sourceInstanceId: "ds-1",
                    accountId: "a1",
                    accountLabel: "A1",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    periods: [
                        makePeriod({
                            id: "w1",
                            accountId: "a1",
                            name: "一周",
                            used: 10,
                            limit: 100,
                        }),
                    ],
                },
                {
                    id: "a2",
                    sourceInstanceId: "ds-1",
                    accountId: "a2",
                    accountLabel: "A2",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    periods: [
                        makePeriod({
                            id: "w2",
                            accountId: "a2",
                            name: "5小时",
                            used: 20,
                            limit: 100,
                        }),
                    ],
                },
                {
                    id: "a3",
                    sourceInstanceId: "ds-1",
                    accountId: "a3",
                    accountLabel: "A3",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    periods: [
                        makePeriod({
                            id: "w3",
                            accountId: "a3",
                            name: "一周",
                            used: 30,
                            limit: 100,
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
                barColorScheme="nine-cycle"
            />,
        );

        // Overview mode: aggregated bars by period type ("一周" idx=0, "5小时" idx=1)
        const fills = document.querySelectorAll(".fill");
        expect(fills.length).toBeGreaterThanOrEqual(2);
        expect((fills[0] as HTMLElement).style.background).toBe(hex_to_rgb(usage_color(0)));
        expect((fills[1] as HTMLElement).style.background).toBe(hex_to_rgb(usage_color(1)));
    });

    it("uses current-only risk colors by default", () => {
        const group = makeGroup({
            periods: [makePeriod({ id: "warn", name: "5小时", used: 61, limit: 100 })],
            accounts: [
                {
                    id: "a1",
                    sourceInstanceId: "ds-1",
                    accountId: "a1",
                    accountLabel: "A1",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    periods: [makePeriod({ id: "warn", name: "5小时", used: 61, limit: 100 })],
                },
            ],
        });

        render(
            <ProviderCard provider="deepseek" group={group} expanded onToggleExpand={vi.fn()} />,
        );

        const fill = document.querySelector<HTMLElement>(".fill");
        if (!fill) throw new Error("missing fill");
        expect(fill.style.background).toBe("var(--risk-yellow)");
    });

    it("resolves projected risk colors and falls back to current-only without elapsed", () => {
        expect(bar_fill_color("risk-projected", { pct: 50, idx: 0, elapsed: 0.4 })).toBe(
            "var(--risk-red)",
        );
        expect(bar_fill_color("risk-projected", { pct: 50, idx: 0 })).toBe("var(--risk-green)");
    });

    it("uses current-only color for multi-account overview when reset display is hidden", () => {
        const first_period = makePeriod({
            id: "a-5h",
            accountId: "a",
            accountLabel: "A",
            name: "Claude Pro · 5小时",
            used: 50,
            limit: 100,
            displayStyle: "percent",
            resetAt: "2026-01-01T17:00:00Z",
        });
        const second_period = makePeriod({
            id: "b-5h",
            accountId: "b",
            accountLabel: "B",
            name: "Claude Pro · 5小时",
            used: 50,
            limit: 100,
            displayStyle: "percent",
            resetAt: "2026-01-01T17:30:00Z",
        });
        const group = makeGroup({
            accountCount: 2,
            periods: [first_period, second_period],
            accounts: [
                {
                    id: "a",
                    sourceInstanceId: "ds-1",
                    accountId: "a",
                    accountLabel: "A",
                    status: "normal",
                    updatedAt: "2026-01-01T15:00:00Z",
                    periods: [first_period],
                },
                {
                    id: "b",
                    sourceInstanceId: "ds-1",
                    accountId: "b",
                    accountLabel: "B",
                    status: "normal",
                    updatedAt: "2026-01-01T15:00:00Z",
                    periods: [second_period],
                },
            ],
        });

        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={vi.fn()}
                barColorScheme="risk-projected"
            />,
        );

        const row = screen.getByText("5小时").closest(".bar-row");
        expect(row).toBeInstanceOf(HTMLElement);
        const fill = (row as HTMLElement).querySelector<HTMLElement>(".fill");
        if (!fill) throw new Error("missing fill");
        expect(fill.style.background).toBe("var(--risk-green)");
        expect((row as HTMLElement).querySelector(".bar-reset")).toBeEmptyDOMElement();
    });

    it("uses nine-cycle colors when configured", () => {
        const group = makeGroup({
            periods: [makePeriod({ id: "first", name: "5小时", used: 95, limit: 100 })],
            accounts: [
                {
                    id: "a1",
                    sourceInstanceId: "ds-1",
                    accountId: "a1",
                    accountLabel: "A1",
                    status: "normal",
                    updatedAt: "2026-06-02T10:00:00Z",
                    periods: [makePeriod({ id: "first", name: "5小时", used: 95, limit: 100 })],
                },
            ],
        });

        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={vi.fn()}
                barColorScheme="nine-cycle"
            />,
        );

        const fill = document.querySelector<HTMLElement>(".fill");
        if (!fill) throw new Error("missing fill");
        expect(fill.style.background).toBe(hex_to_rgb(usage_color(0)));
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

        const bars = document.querySelector(".bars");
        expect(bars).toBeInTheDocument();
        expect(bars?.querySelectorAll(".bar-row.capsule")).toHaveLength(2);
    });

    it("does not apply fill.blue, fill.purple, or fill.danger classes", () => {
        const group = makeGroup({
            periods: [
                makePeriod({ id: "w1", name: "5小时", used: 10, limit: 100 }),
                makePeriod({ id: "w2", name: "一周", used: 90, limit: 100, status: "critical" }),
            ],
        });

        render(<ProviderCard provider="deepseek" group={group} />);

        const fills = document.querySelectorAll(".fill");
        for (const f of fills) {
            expect(f.classList.contains("blue")).toBe(false);
            expect(f.classList.contains("purple")).toBe(false);
            expect(f.classList.contains("danger")).toBe(false);
        }
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
                    resetAt: "2026-06-02T12:00:00Z",
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
                    periods: [
                        makePeriod({
                            id: "empty",
                            name: "5小时",
                            used: null,
                            limit: 100,
                            displayStyle: "percent",
                            resetAt: "2026-06-02T12:00:00Z",
                        }),
                    ],
                },
            ],
        });

        render(
            <ProviderCard provider="deepseek" group={group} expanded onToggleExpand={vi.fn()} />,
        );

        const row = screen.getByText("5小时").closest(".bar-row");
        expect(row).toBeInstanceOf(HTMLElement);
        const bar_row = row as HTMLElement;
        const fill = bar_row.querySelector(".fill");
        expect(fill).toBeInstanceOf(HTMLElement);
        expect((fill as HTMLElement).style.width).toBe("0%");
        expect(bar_row.querySelector(".bar-pct")).toBeEmptyDOMElement();
        expect(bar_row.querySelector(".bar-reset")).toBeEmptyDOMElement();
        expect(within(bar_row).queryByText("0%")).not.toBeInTheDocument();
        expect(within(bar_row).queryByText("--")).not.toBeInTheDocument();
    });

    it("failed provider card is collapsible even without accounts", () => {
        const onToggleExpand = vi.fn();
        render(
            <ProviderCard
                provider="minimax"
                connectorError={{ error: "NETWORK_ERROR", displayName: "MiniMax" }}
                onToggleExpand={onToggleExpand}
                expanded={false}
            />,
        );
        const toggle = screen.getByLabelText("展开");
        expect(toggle).toBeInTheDocument();
        fireEvent.click(toggle);
        expect(onToggleExpand).toHaveBeenCalledWith("minimax");
    });

    it("failed provider card with accounts is collapsible", () => {
        const onToggleExpand = vi.fn();
        const group = makeGroup({
            provider: "minimax",
            label: "MiniMax",
            status: "critical",
            accounts: [
                {
                    id: "acc-mm",
                    sourceInstanceId: "mm-1",
                    accountId: "acc-mm",
                    accountLabel: "MiniMax Account",
                    status: "critical",
                    updatedAt: "2026-06-02T10:00:00Z",
                    periods: [],
                },
            ],
            accountCount: 1,
        });
        render(
            <ProviderCard
                provider="minimax"
                group={group}
                connectorError={{ error: "NETWORK_ERROR", displayName: "MiniMax" }}
                onToggleExpand={onToggleExpand}
                expanded={false}
            />,
        );
        const toggle = screen.getByLabelText("展开");
        expect(toggle).toBeInTheDocument();
    });

    it("calls onEditAccount with first account when edit is clicked", () => {
        const onEditAccount = vi.fn();
        const group = makeGroup();
        render(<ProviderCard provider="deepseek" group={group} onEditAccount={onEditAccount} />);
        fireEvent.click(screen.getByLabelText("更多操作"));
        fireEvent.click(screen.getByText("编辑"));
        expect(onEditAccount).toHaveBeenCalledTimes(1);
        expect(onEditAccount).toHaveBeenCalledWith(group.accounts[0]);
    });

    it("falls back to settings.open() when onEditAccount is not provided", () => {
        const group = makeGroup();
        // eslint-disable-next-line @typescript-eslint/unbound-method
        const open = window.usageboard.settings.open;
        render(<ProviderCard provider="deepseek" group={group} />);
        fireEvent.click(screen.getByLabelText("更多操作"));
        fireEvent.click(screen.getByText("编辑"));
        expect(open).toHaveBeenCalledTimes(1);
        expect(open).toHaveBeenCalledWith({ provider: "deepseek" });
    });

    it("does not add alert class when group status is critical (only connectorError triggers alert)", () => {
        const group = makeGroup({
            status: "critical",
            periods: [
                makePeriod({ id: "w1", name: "5小时", used: 95, limit: 100, status: "critical" }),
            ],
        });
        const { container } = render(<ProviderCard provider="deepseek" group={group} />);
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
        expect(card.classList.contains("alert")).toBe(false);
    });

    it("does not add alert class when group status is normal", () => {
        const group = makeGroup({ status: "normal" });
        const { container } = render(<ProviderCard provider="deepseek" group={group} />);
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
        expect(card.classList.contains("alert")).toBe(false);
    });

    it("does not add alert class when connectorError is set", () => {
        const { container } = render(
            <ProviderCard
                provider="minimax"
                connectorError={{ error: "NETWORK_ERROR", displayName: "MiniMax" }}
                onToggleExpand={vi.fn()}
                expanded={false}
            />,
        );
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
        expect(card.classList.contains("alert")).toBe(false);
    });

    it("does not add alert class when group has warning status", () => {
        const group = makeGroup({
            status: "warning",
            periods: [
                makePeriod({ id: "w1", name: "5小时", used: 80, limit: 100, status: "warning" }),
            ],
        });
        const { container } = render(<ProviderCard provider="deepseek" group={group} />);
        const card = container.querySelector(".card");
        if (!card) throw new Error("missing .card");
        expect(card.classList.contains("alert")).toBe(false);
    });
});

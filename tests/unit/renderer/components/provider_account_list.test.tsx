import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderAccountList } from "../../../../src/renderer/components/ProviderAccountList";
import type { ProviderUsageGroup } from "../../../../src/renderer/lib/provider-usage";

function make_group(): ProviderUsageGroup {
    const period = {
        id: "codex-a-5h",
        metric_id: "codex:auth-a:5h",
        provider: "codex" as const,
        source: "gateway" as const,
        sourceInstanceId: "cpa-main",
        connectorInstanceId: "cpa-connector",
        connectorDisplayName: "CPA",
        accountId: "auth-a",
        accountLabel: "Account A",
        raw_label: "5h",
        name: "5小时",
        used: 50,
        limit: 100,
        displayStyle: "percent" as const,
        resetAt: 1767286800000,
        cycleDurationMs: 5 * 3_600_000,
        status: "normal" as const,
        updatedAt: "2026-01-01T15:00:00Z",
        observedAt: 1735689600000,
        stale: false,
    };
    return {
        provider: "codex",
        label: "Codex",
        accountCount: 1,
        status: "normal",
        updatedAt: "2026-01-01T15:00:00Z",
        observedAt: 1735689600000,
        stale: false,
        periods: [period],
        accounts: [
            {
                id: "cpa-main:label:Account A",
                sourceInstanceId: "cpa-main",
                accountId: "auth-a",
                accountLabel: "Account A",
                status: "normal",
                updatedAt: "2026-01-01T15:00:00Z",
                observedAt: 1735689600000,
                stale: false,
                periods: [period],
            },
        ],
    };
}

describe("ProviderAccountList", () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    it("passes projected color scheme to collapsible account rows", () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date("2026-01-01T15:00:00Z"));

        render(
            <ProviderAccountList
                group={make_group()}
                collapsedAccounts={{}}
                onToggleAccount={vi.fn()}
                barColorScheme="risk-projected"
            />,
        );

        const row = screen.getByText("5小时").closest(".bar-row");
        expect(row).toBeInstanceOf(HTMLElement);
        const fill = (row as HTMLElement).querySelector<HTMLElement>(".fill");
        if (!fill) throw new Error("missing fill");
        expect(fill.style.background).toBe("var(--risk-yellow)");
    });

    it("uses account label maps keyed by connector instance id", () => {
        render(
            <ProviderAccountList
                group={make_group()}
                accountLabelMaps={{ "cpa-connector": { "5h": "五小时自定义" } }}
            />,
        );

        expect(screen.getByText("五小时自定义")).toBeInTheDocument();
        expect(screen.queryByText("5小时")).not.toBeInTheDocument();
    });

    // t158: onReLogin must reach ProviderAccountRow (was being discarded before).
    it("forwards onReLogin to each account row's re-login button", () => {
        const onReLogin = vi.fn();
        const group = make_group();
        // Inject an error for the only account so the row renders a re-login button.
        const accountErrors = new Map([
            [
                "cpa-main:label:Account A",
                {
                    provider: "codex",
                    sourceInstanceId: "cpa-main",
                    accountId: "auth-a",
                    accountLabel: "Account A",
                    error: "HTTP 401",
                },
            ],
        ]);
        render(
            <ProviderAccountList
                group={group}
                onReLogin={onReLogin}
                accountErrors={accountErrors}
            />,
        );
        const link = screen.getByRole("button", { name: /重新登录/ });
        fireEvent.click(link);
        // onReLogin called with instanceId + accountId + provider
        expect(onReLogin).toHaveBeenCalledWith("cpa-main", "auth-a", "codex");
    });

    it("renders multi-account list with one card per account (t215 structure)", () => {
        // jsdom 无 CSS 引擎，grid 布局由 globals.css 声明 + [deploy] 视觉验证；
        // 此处只断言结构：容器 + 每账号一 card，多列折行由 CSS 保证。
        const base_period = make_group().accounts[0]?.periods[0];
        if (!base_period) throw new Error("no period");
        const mk_account = (id: string, label: string) => ({
            id: `cpa-main:label:${label}`,
            sourceInstanceId: "cpa-main",
            accountId: id,
            accountLabel: label,
            status: "normal" as const,
            updatedAt: "2026-01-01T15:00:00Z",
            observedAt: 1735689600000,
            stale: false,
            periods: [{ ...base_period, accountId: id }],
        });
        const group: ProviderUsageGroup = {
            provider: "codex",
            label: "Codex",
            accountCount: 3,
            status: "normal",
            updatedAt: "2026-01-01T15:00:00Z",
            observedAt: 1735689600000,
            stale: false,
            periods: [base_period],
            accounts: [mk_account("a", "A"), mk_account("b", "B"), mk_account("c", "C")],
        };
        const { container } = render(<ProviderAccountList group={group} />);
        const list = container.querySelector(".provider-account-list");
        expect(list).not.toBeNull();
        if (!list) throw new Error("no list");
        // 子项为各账号 card，顺序保持 fixture 顺序
        const cards = list.querySelectorAll(":scope > .card");
        expect(cards).toHaveLength(3);
    });
});

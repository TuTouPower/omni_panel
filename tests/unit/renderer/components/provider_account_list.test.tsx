import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProviderAccountList } from "../../../../src/renderer/components/ProviderAccountList";
import type { ProviderUsageGroup } from "../../../../src/renderer/lib/provider-usage";

function make_group(): ProviderUsageGroup {
    const period = {
        id: "codex-a-5h",
        provider: "codex" as const,
        source: "cpa" as const,
        sourceInstanceId: "cpa-main",
        connectorInstanceId: "cpa-connector",
        connectorDisplayName: "CPA",
        accountId: "auth-a",
        accountLabel: "Account A",
        raw_label: "5h",
        name: "Codex · 5小时",
        used: 50,
        limit: 100,
        displayStyle: "percent" as const,
        resetAt: 1767286800000,
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
});

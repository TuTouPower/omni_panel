import { render, screen } from "@testing-library/react";
import { describe, expect, it, beforeEach } from "vitest";
import { ProviderCard } from "../../../../src/renderer/components/ProviderCard";
import { bar_fill_color, usage_color } from "../../../../src/renderer/lib/usage-colors";
import { makeGroup, makePeriod, hex_to_rgb, setupWindowUsageboard } from "./provider_card_fixture";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("ProviderCard - colors", () => {
    beforeEach(() => {
        setupWindowUsageboard();
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
                    observedAt: 1748858400000,
                    stale: false,
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
                    observedAt: 1748858400000,
                    stale: false,
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
                    observedAt: 1748858400000,
                    stale: false,
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
                onToggleExpand={() => undefined}
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
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [makePeriod({ id: "warn", name: "5小时", used: 61, limit: 100 })],
                },
            ],
        });

        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={() => undefined}
            />,
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
        const per = makePeriod({
            id: "a-5h",
            accountId: "a",
            accountLabel: "A",
            name: "5小时",
            used: 50,
            limit: 100,
            displayStyle: "percent",
            resetAt: 1735750800000,
        });
        const second_period = makePeriod({
            id: "b-5h",
            accountId: "b",
            accountLabel: "B",
            name: "5小时",
            used: 50,
            limit: 100,
            displayStyle: "percent",
            resetAt: 1735752600000,
        });
        const group = makeGroup({
            accountCount: 2,
            periods: [per, second_period],
            accounts: [
                {
                    id: "a",
                    sourceInstanceId: "ds-1",
                    accountId: "a",
                    accountLabel: "A",
                    status: "normal",
                    updatedAt: "2026-01-01T15:00:00Z",
                    observedAt: 1735689600000,
                    stale: false,
                    periods: [per],
                },
                {
                    id: "b",
                    sourceInstanceId: "ds-1",
                    accountId: "b",
                    accountLabel: "B",
                    status: "normal",
                    updatedAt: "2026-01-01T15:00:00Z",
                    observedAt: 1735689600000,
                    stale: false,
                    periods: [second_period],
                },
            ],
        });

        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={() => undefined}
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
                    observedAt: 1748858400000,
                    stale: false,
                    periods: [makePeriod({ id: "first", name: "5小时", used: 95, limit: 100 })],
                },
            ],
        });

        render(
            <ProviderCard
                provider="deepseek"
                group={group}
                expanded
                onToggleExpand={() => undefined}
                barColorScheme="nine-cycle"
            />,
        );

        const fill = document.querySelector<HTMLElement>(".fill");
        if (!fill) throw new Error("missing fill");
        expect(fill.style.background).toBe(hex_to_rgb(usage_color(0)));
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
});

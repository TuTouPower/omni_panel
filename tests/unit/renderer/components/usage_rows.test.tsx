import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
    UsageBarRow,
    AccountUsageRow,
    split_reset_time,
} from "../../../../src/renderer/components/UsageRows";
import type {
    ProviderUsageAccount,
    ProviderUsagePeriod,
} from "../../../../src/renderer/lib/provider-usage";

function make_period(overrides: Partial<ProviderUsagePeriod> = {}): ProviderUsagePeriod {
    return {
        id: "period-1",
        provider: "glm",
        source: "gateway",
        sourceInstanceId: "cpa-main",
        connectorInstanceId: "cpa-main",
        connectorDisplayName: "CPA",
        accountId: "glm-main",
        accountLabel: "GLM Account",
        name: "glm-4-plus",
        raw_label: "glm-4-plus",
        used: 10,
        limit: 100,
        displayStyle: "percent",
        resetAt: 1747571400000,
        status: "normal",
        updatedAt: "2026-05-18T12:00:00Z",
        observedAt: 1747567200000,
        stale: false,
        ...overrides,
    };
}

describe("UsageBarRow", () => {
    it("splits reset time into date and clock columns", () => {
        expect(split_reset_time("今天 13:10")).toEqual({ date: "今天", clock: "13:10" });
        expect(split_reset_time("5/18 21:00")).toEqual({ date: "05.18", clock: "21:00" });
        expect(split_reset_time("")).toEqual({ date: "", clock: "" });
    });

    it("renders capsule rows without a standalone value column", () => {
        const { container } = render(
            <UsageBarRow period={make_period()} index={0} barStyle="capsule" />,
        );

        expect(container.querySelector(".bar-row.capsule")).toBeInTheDocument();
        expect(container.querySelector(".bar-pct")).not.toBeInTheDocument();
        expect(container.querySelectorAll(".bar-capsule-value")).toHaveLength(2);
        expect(container.querySelector(".bar-capsule-value-dark")?.textContent).toBe("10%");
        // used=10/limit=100 → pct=10 → clipPath = inset(0 {100-10}% 0 0)
        const expectedPct = Math.round((10 / 100) * 100);
        expect(
            container.querySelector<HTMLElement>(".bar-capsule-value-light")?.style.clipPath,
        ).toBe(`inset(0 ${String(100 - expectedPct)}% 0 0)`);
        expect(
            container.querySelector<HTMLElement>(".track")?.style.getPropertyValue("--bar-fill"),
        ).not.toBe("");
    });

    it("renders empty value and zero fill when used is null (thin style)", () => {
        const { container } = render(
            <UsageBarRow period={make_period({ used: null })} index={0} barStyle="thin" />,
        );

        expect(container.querySelector(".bar-pct")?.textContent).toBe("");
        expect(container.querySelector<HTMLElement>(".fill")?.style.width).toBe("0%");
    });

    it("renders empty capsule values and zero fill when used is null (capsule style)", () => {
        const { container } = render(
            <UsageBarRow period={make_period({ used: null })} index={0} barStyle="capsule" />,
        );

        expect(container.querySelector(".bar-capsule-value-dark")?.textContent).toBe("");
        expect(container.querySelector(".bar-capsule-value-light")?.textContent).toBe("");
        expect(container.querySelector<HTMLElement>(".fill")?.style.width).toBe("0%");
    });

    it("uses custom label map before built-in labels", () => {
        render(
            <UsageBarRow
                period={make_period()}
                index={0}
                labelMap={{ "glm-4-plus": "GLM Custom" }}
            />,
        );

        expect(screen.getByText("GLM Custom")).toBeInTheDocument();
    });

    it("shows ratio by default for displayStyle ratio", () => {
        const { container } = render(
            <UsageBarRow
                period={make_period({ displayStyle: "ratio", used: 3, limit: 10 })}
                index={0}
                barStyle="thin"
            />,
        );
        expect(container.querySelector(".bar-pct")?.textContent).toBe("3/10");
        expect(container.querySelector(".bar-row.frac")).toBeInTheDocument();
    });

    it("forcePercent converts ratio periods to percent display", () => {
        const { container } = render(
            <UsageBarRow
                period={make_period({ displayStyle: "ratio", used: 3, limit: 10 })}
                index={0}
                barStyle="thin"
                forcePercent
            />,
        );
        expect(container.querySelector(".bar-pct")?.textContent).toBe("30%");
        expect(container.querySelector(".bar-row.frac")).not.toBeInTheDocument();
    });
});

describe("UsageBarRow upcoming-reset watch toggle (t043)", () => {
    it("renders bell button when on_toggle_watched provided", () => {
        render(<UsageBarRow period={make_period()} index={0} on_toggle_watched={vi.fn()} />);
        const bell = screen.getByRole("button", { name: "监控该数据标签的即将重置" });
        expect(bell).toBeInTheDocument();
        expect(bell.getAttribute("title")).toBe("监控该数据标签的即将重置");
    });

    it("does not render bell button when on_toggle_watched is missing", () => {
        const { container } = render(<UsageBarRow period={make_period()} index={0} />);
        expect(container.querySelector(".bar-watch")).not.toBeInTheDocument();
    });

    it("reflects watched=false via aria-pressed=false and dimmed icon by default", () => {
        render(<UsageBarRow period={make_period()} index={0} on_toggle_watched={vi.fn()} />);
        const bell = screen.getByRole("button", { name: "监控该数据标签的即将重置" });
        expect(bell).toHaveAttribute("aria-pressed", "false");
        const icon = bell.querySelector("svg");
        expect(icon).toHaveStyle({ opacity: "0.35" });
    });

    it("reflects watched=true via aria-pressed=true and full opacity icon", () => {
        render(
            <UsageBarRow period={make_period()} index={0} watched on_toggle_watched={vi.fn()} />,
        );
        const bell = screen.getByRole("button", { name: "监控该数据标签的即将重置" });
        expect(bell).toHaveAttribute("aria-pressed", "true");
        const icon = bell.querySelector("svg");
        expect(icon).toHaveStyle({ opacity: "1" });
    });

    it("invokes on_toggle_watched callback on click", async () => {
        const user = userEvent.setup();
        const on_toggle_watched = vi.fn();
        render(
            <UsageBarRow period={make_period()} index={0} on_toggle_watched={on_toggle_watched} />,
        );
        await user.click(screen.getByRole("button", { name: "监控该数据标签的即将重置" }));
        expect(on_toggle_watched).toHaveBeenCalledTimes(1);
    });
});

describe("AccountUsageRow upcoming-reset watch toggle (t046)", () => {
    function make_account(overrides: Partial<ProviderUsageAccount> = {}): ProviderUsageAccount {
        return {
            id: "glm-main",
            sourceInstanceId: "cpa-main",
            accountId: "glm-main",
            accountLabel: "GLM Account",
            status: "normal",
            updatedAt: "2026-05-18T12:00:00Z",
            observedAt: 1747567200000,
            stale: false,
            periods: [
                make_period({ id: "p1", raw_label: "glm-4-plus" }),
                make_period({ id: "p2", raw_label: "glm-4-air" }),
            ],
            ...overrides,
        };
    }

    it("renders bell for each period when on_toggle_watched provided", () => {
        render(
            <AccountUsageRow
                account={make_account()}
                on_toggle_watched={vi.fn()}
                watched_labels={new Set(["glm-4-plus"])}
            />,
        );
        const bells = screen.getAllByRole("button", { name: "监控该数据标签的即将重置" });
        expect(bells).toHaveLength(2);
    });

    it("does not render bells when on_toggle_watched is missing", () => {
        const { container } = render(
            <AccountUsageRow account={make_account()} watched_labels={new Set(["glm-4-plus"])} />,
        );
        expect(container.querySelectorAll(".bar-watch")).toHaveLength(0);
    });

    it("reflects watched state per raw_label via aria-pressed", () => {
        render(
            <AccountUsageRow
                account={make_account()}
                on_toggle_watched={vi.fn()}
                watched_labels={new Set(["glm-4-plus"])}
            />,
        );
        const bells = screen.getAllByRole("button", { name: "监控该数据标签的即将重置" });
        // glm-4-plus is watched → aria-pressed=true
        // glm-4-air is not watched → aria-pressed=false
        const pressed = bells.map((b) => b.getAttribute("aria-pressed"));
        expect(pressed).toContain("true");
        expect(pressed).toContain("false");
        expect(pressed.filter((v) => v === "true")).toHaveLength(1);
    });

    it("invokes on_toggle_watched with the period raw_label on click", async () => {
        const user = userEvent.setup();
        const on_toggle_watched = vi.fn();
        render(
            <AccountUsageRow
                account={make_account()}
                on_toggle_watched={on_toggle_watched}
                watched_labels={new Set()}
            />,
        );
        const bells = screen.getAllByRole("button", { name: "监控该数据标签的即将重置" });
        expect(bells).toHaveLength(2);
        const second = bells[1];
        expect(second).toBeInTheDocument();
        if (second) {
            await user.click(second);
        }
        expect(on_toggle_watched).toHaveBeenCalledWith("glm-4-air");
    });
});

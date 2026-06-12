import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UsageBarRow, split_reset_time } from "../../../../src/renderer/components/UsageRows";
import type { ProviderUsagePeriod } from "../../../../src/renderer/lib/provider-usage";

function make_period(overrides: Partial<ProviderUsagePeriod> = {}): ProviderUsagePeriod {
    return {
        id: "period-1",
        provider: "gemini",
        source: "cpa",
        sourceInstanceId: "cpa-main",
        connectorInstanceId: "cpa-main",
        connectorDisplayName: "CPA",
        accountId: "gemini-main",
        accountLabel: "Gemini Account",
        name: "gemini-3.1-flash-lite-preview",
        used: 10,
        limit: 100,
        displayStyle: "percent",
        resetAt: "2026-05-18T13:10:00Z",
        status: "normal",
        updatedAt: "2026-05-18T12:00:00Z",
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
        expect(
            container.querySelector<HTMLElement>(".bar-capsule-value-light")?.style.clipPath,
        ).toBe("inset(0 90% 0 0)");
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
                labelMap={{ "gemini-3.1-flash-lite-preview": "Gemini Custom" }}
            />,
        );

        expect(screen.getByText("Gemini Custom")).toBeInTheDocument();
    });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { UsageBarRow, split_reset_time } from "../../../../src/renderer/components/UsageRows";
import type { ProviderUsagePeriod } from "../../../../src/renderer/lib/provider-usage";

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
});

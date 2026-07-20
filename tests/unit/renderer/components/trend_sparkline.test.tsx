import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TrendSparkline } from "../../../../src/renderer/components/TrendSparkline";
import type { TrendPoint } from "../../../../src/shared/types/ipc";

describe("TrendSparkline", () => {
    it("renders polyline, area path and one circle per point when ≥2 valid", () => {
        const data: (TrendPoint | null)[] = [
            { date: "2026-07-14", percent: 10 },
            { date: "2026-07-15", percent: 20 },
            { date: "2026-07-16", percent: 30 },
        ];
        const { container } = render(<TrendSparkline data={data} />);

        expect(container.querySelector("polyline")).not.toBeNull();
        expect(container.querySelectorAll("circle").length).toBe(3);
        expect(container.querySelector("path")).not.toBeNull();
    });

    it("renders only as many circles as valid points (skips null)", () => {
        const data: (TrendPoint | null)[] = [
            null,
            { date: "2026-07-15", percent: 20 },
            null,
            { date: "2026-07-17", percent: 40 },
        ];
        const { container } = render(<TrendSparkline data={data} />);

        expect(container.querySelectorAll("circle").length).toBe(2);
    });

    it("renders placeholder when fewer than 2 valid points", () => {
        const data: (TrendPoint | null)[] = [{ date: "2026-07-14", percent: 10 }];
        const { container, getByText } = render(<TrendSparkline data={data} />);

        expect(container.querySelector("polyline")).toBeNull();
        expect(container.querySelector("circle")).toBeNull();
        expect(getByText(/数据不足/)).toBeInTheDocument();
    });

    it("renders placeholder when all points are null", () => {
        const data: (TrendPoint | null)[] = [null, null, null, null, null, null, null];
        const { container } = render(<TrendSparkline data={data} />);

        expect(container.querySelector("polyline")).toBeNull();
    });

    it("renders 0/50/100% grid lines and left-side tick labels", () => {
        const data: (TrendPoint | null)[] = [
            { date: "2026-07-14", percent: 10 },
            { date: "2026-07-15", percent: 20 },
        ];
        const { container } = render(<TrendSparkline data={data} />);

        const texts = Array.from(container.querySelectorAll("text")).map((t) => t.textContent);
        expect(texts).toEqual(expect.arrayContaining(["0%", "50%", "100%"]));
    });

    it("does not crash with empty data", () => {
        const { container } = render(<TrendSparkline data={[]} />);
        expect(container.querySelector("polyline")).toBeNull();
    });
});

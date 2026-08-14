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

    it("t383 AC-002: 7 天窗口 7 个日点、宽度足够时标签全显示（≥7）", () => {
        const data: (TrendPoint | null)[] = Array.from({ length: 7 }, (_, i) => ({
            date: `2026-07-${String(i + 1).padStart(2, "0")}T00:00Z`,
            percent: i * 10,
        }));
        const { container } = render(<TrendSparkline data={data} />);

        const date_texts = Array.from(container.querySelectorAll("text")).filter((t) =>
            t.textContent.includes("-"),
        );
        expect(date_texts.length).toBeGreaterThanOrEqual(7);
        // 首尾标签仍在。
        expect(date_texts[0]?.textContent).toBe("07-01");
        expect(date_texts[date_texts.length - 1]?.textContent).toBe("07-07");
    });

    it("t383 AC-003: 点数远超宽度时标签节流，标签数小于点数", () => {
        const data: (TrendPoint | null)[] = Array.from({ length: 120 }, (_, i) => ({
            date: `2026-07-${String(Math.floor(i / 4) + 1).padStart(2, "0")}T00:00Z`,
            percent: i % 100,
        }));
        const { container } = render(<TrendSparkline data={data} />);

        const date_texts = Array.from(container.querySelectorAll("text")).filter((t) =>
            t.textContent.includes("-"),
        );
        expect(date_texts.length).toBeLessThan(120);
        expect(date_texts.length).toBeGreaterThan(1);
    });

    it("t383 AC-001: 同一 UTC 日内多点显示时刻 HH:mm，跨日期显示 MM-DD", () => {
        const intraday: (TrendPoint | null)[] = [
            { date: "2026-07-20T08:00Z", percent: 10 },
            { date: "2026-07-20T10:00Z", percent: 20 },
            { date: "2026-07-20T13:00Z", percent: 30 },
        ];
        const { container } = render(<TrendSparkline data={intraday} />);
        const labels = Array.from(container.querySelectorAll("text"))
            .map((t) => t.textContent)
            .filter((s) => /^\d{2}:\d{2}$/.test(s));
        expect(labels).toEqual(["08:00", "10:00", "13:00"]);

        const { container: cross } = render(
            <TrendSparkline
                data={[
                    { date: "2026-07-20T00:00Z", percent: 10 },
                    { date: "2026-07-21T00:00Z", percent: 20 },
                ]}
            />,
        );
        const cross_labels = Array.from(cross.querySelectorAll("text"))
            .map((t) => t.textContent)
            .filter((s) => /^\d{2}-\d{2}$/.test(s));
        expect(cross_labels).toEqual(["07-20", "07-21"]);
    });

    it("renders a date label for every point when there are 5 or fewer", () => {
        const data: (TrendPoint | null)[] = [
            { date: "2026-07-14", percent: 10 },
            { date: "2026-07-15", percent: 20 },
            { date: "2026-07-16", percent: 30 },
            { date: "2026-07-17", percent: 40 },
        ];
        const { container } = render(<TrendSparkline data={data} />);

        const date_texts = Array.from(container.querySelectorAll("text")).filter((t) =>
            t.textContent.includes("-"),
        );
        expect(date_texts.length).toBe(4);
    });
});

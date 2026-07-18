import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { RangePicker } from "../../../../../src/renderer/components/token-stats/RangePicker";

describe("RangePicker", () => {
    it("opens the popup when the button is clicked", () => {
        render(<RangePicker start={0} end={1000} active={false} onApply={() => undefined} />);
        fireEvent.click(screen.getByTitle("自定义时间范围"));
        expect(screen.getByText("开始")).toBeInTheDocument();
        expect(screen.getByText("结束")).toBeInTheDocument();
    });

    it("applies a valid custom range", () => {
        const onApply = vi.fn();
        render(<RangePicker start={0} end={1000} active={false} onApply={onApply} />);
        fireEvent.click(screen.getByTitle("自定义时间范围"));

        const inputs = document.querySelectorAll('input[type="datetime-local"]');
        const startInput = inputs[0] as HTMLInputElement;
        const endInput = inputs[1] as HTMLInputElement;
        fireEvent.change(startInput, { target: { value: "2026-07-10T08:00" } });
        fireEvent.change(endInput, { target: { value: "2026-07-10T09:00" } });
        fireEvent.click(screen.getByText("应用"));

        expect(onApply).toHaveBeenCalledOnce();
        const call = onApply.mock.calls[0];
        if (!call) throw new Error("expected one call");
        const arg = call[0] as { start: number; end: number };
        expect(arg.start).toBe(new Date("2026-07-10T08:00").getTime());
        expect(arg.end).toBe(new Date("2026-07-10T09:00").getTime());
    });
});

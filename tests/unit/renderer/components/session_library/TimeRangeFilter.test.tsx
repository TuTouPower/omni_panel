import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TimeRangeFilter } from "../../../../../src/renderer/components/session-library/TimeRangeFilter";

describe("TimeRangeFilter", () => {
    it("AC-001: 在预设模式下点击日历按钮，RangePicker 保持打开状态，展示开始/结束时间及应用按钮", async () => {
        const onChange = vi.fn();
        render(<TimeRangeFilter preset="all" applied_range={{}} on_change={onChange} />);

        const calBtn = screen.getByTestId("time-custom-button");
        await userEvent.click(calBtn);

        // RangePicker shows inputs and "应用" button
        expect(screen.getByText("应用")).toBeInTheDocument();
        expect(screen.getByText("开始")).toBeInTheDocument();
        expect(screen.getByText("结束")).toBeInTheDocument();
    });

    it("AC-002: 在自定义胶囊模式下点击重选日历按钮，RangePicker 保持打开状态", async () => {
        const onChange = vi.fn();
        render(
            <TimeRangeFilter
                preset="custom"
                applied_range={{ start_at: 1700000000000, end_at: 1700003600000 }}
                on_change={onChange}
            />,
        );

        const reselectBtn = screen.getByTestId("time-custom-reselect");
        await userEvent.click(reselectBtn);

        expect(screen.getByText("应用")).toBeInTheDocument();
        expect(screen.getByText("开始")).toBeInTheDocument();
        expect(screen.getByText("结束")).toBeInTheDocument();
    });

    it("AC-003: 在时间范围选择弹层打开状态下，点击外部区域，弹层正常关闭", async () => {
        const onChange = vi.fn();
        render(
            <div>
                <div data-testid="outside-element">外部区域</div>
                <TimeRangeFilter preset="all" applied_range={{}} on_change={onChange} />
            </div>,
        );

        // Open picker
        await userEvent.click(screen.getByTestId("time-custom-button"));
        expect(screen.getByText("应用")).toBeInTheDocument();

        // Click outside
        await userEvent.click(screen.getByTestId("outside-element"));
        expect(screen.queryByText("应用")).not.toBeInTheDocument();
    });

    it("AC-004: 在弹层内输入有效时间范围并点击应用，正确触发 on_change 切换为 custom", async () => {
        const onChange = vi.fn();
        render(<TimeRangeFilter preset="all" applied_range={{}} on_change={onChange} />);

        await userEvent.click(screen.getByTestId("time-custom-button"));
        const inputs = document.querySelectorAll('input[type="datetime-local"]');
        expect(inputs).toHaveLength(2);
        fireEvent.change(inputs[0] as HTMLInputElement, { target: { value: "2026-07-10T08:00" } });
        fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: "2026-07-10T09:00" } });
        await userEvent.click(screen.getByText("应用"));

        expect(onChange).toHaveBeenCalledWith("custom", {
            start_at: new Date("2026-07-10T08:00").getTime(),
            end_at: new Date("2026-07-10T09:00").getTime(),
        });
        expect(screen.queryByText("应用")).not.toBeInTheDocument();
    });

    it("再次点击日历按钮正常切换关闭弹层（验证 zoneRef 正确关联触发按钮）", async () => {
        const onChange = vi.fn();
        render(<TimeRangeFilter preset="all" applied_range={{}} on_change={onChange} />);

        const calBtn = screen.getByTestId("time-custom-button");
        await userEvent.click(calBtn);
        expect(screen.getByText("应用")).toBeInTheDocument();

        await userEvent.click(calBtn);
        expect(screen.queryByText("应用")).not.toBeInTheDocument();
    });
});

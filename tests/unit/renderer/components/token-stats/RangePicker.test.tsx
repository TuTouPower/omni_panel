import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { render, screen, fireEvent } from "@testing-library/react";
import { RangePicker } from "../../../../../src/renderer/components/token-stats/RangePicker";

describe("RangePicker", () => {
    it("applies a valid custom range", () => {
        const onApply = vi.fn();
        render(
            <RangePicker
                start={0}
                end={1000}
                onApply={onApply}
                open
                onOpenChange={() => undefined}
            />,
        );

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

    it("t451 AC-005: 非法区间应用报错且面板不关闭、不回调", () => {
        const onApply = vi.fn();
        render(
            <RangePicker
                start={0}
                end={1000}
                onApply={onApply}
                open
                onOpenChange={() => undefined}
            />,
        );

        const inputs = document.querySelectorAll('input[type="datetime-local"]');
        fireEvent.change(inputs[0] as HTMLInputElement, {
            target: { value: "2026-07-10T09:00" },
        });
        fireEvent.change(inputs[1] as HTMLInputElement, {
            target: { value: "2026-07-10T08:00" },
        });
        fireEvent.click(screen.getByText("应用"));

        expect(onApply).not.toHaveBeenCalled();
        // 面板保持打开并给出行内错误，而非静默关闭。
        expect(screen.getByText("开始")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toBeInTheDocument();
    });

    it("t451 AC-008: 弹出层使用可解析的层级类", () => {
        render(
            <RangePicker
                start={0}
                end={1000}
                onApply={() => undefined}
                open
                onOpenChange={() => undefined}
            />,
        );
        const popup = screen.getByRole("button", { name: "应用" }).closest("div.absolute");
        expect(popup?.className).toContain("z-[var(--z-menu)]");
        // t451_gen_f002：类引用的 token 必须在 globals @theme 真实定义，
        // 否则类名不断言、构建产物亦无规则（构建产物正向门禁见 t452）。
        const globals_css = readFileSync(
            join(process.cwd(), "src/renderer/styles/globals.css"),
            "utf8",
        );
        expect(globals_css).toMatch(/--z-menu:\s*60/);
    });

    it("t451 AC-005 f001: 空输入应用报错且面板不关闭、不回调", () => {
        const onApply = vi.fn();
        render(
            <RangePicker
                start={0}
                end={1000}
                onApply={onApply}
                open
                onOpenChange={() => undefined}
            />,
        );

        const inputs = document.querySelectorAll('input[type="datetime-local"]');
        fireEvent.change(inputs[0] as HTMLInputElement, { target: { value: "" } });
        fireEvent.change(inputs[1] as HTMLInputElement, { target: { value: "" } });
        fireEvent.click(screen.getByText("应用"));

        expect(onApply).not.toHaveBeenCalled();
        expect(screen.getByText("开始")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("请输入有效的开始与结束时间");
    });

    it("t451 AC-005 f001: 起止相等应用报错且面板不关闭、不回调", () => {
        const onApply = vi.fn();
        render(
            <RangePicker
                start={0}
                end={1000}
                onApply={onApply}
                open
                onOpenChange={() => undefined}
            />,
        );

        const inputs = document.querySelectorAll('input[type="datetime-local"]');
        fireEvent.change(inputs[0] as HTMLInputElement, {
            target: { value: "2026-07-10T08:00" },
        });
        fireEvent.change(inputs[1] as HTMLInputElement, {
            target: { value: "2026-07-10T08:00" },
        });
        fireEvent.click(screen.getByText("应用"));

        expect(onApply).not.toHaveBeenCalled();
        expect(screen.getByText("开始")).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent("结束时间必须晚于开始时间");
    });
});

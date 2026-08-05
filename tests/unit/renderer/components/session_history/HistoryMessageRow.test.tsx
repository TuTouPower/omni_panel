import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HistoryMessageRow } from "../../../../../src/renderer/components/session-history/HistoryMessageRow";
import {
    format_time_full,
    format_time_short,
} from "../../../../../src/renderer/lib/session-history/markdown";

/**
 * t211 消息行组件测试：pre 渲染、角色区分、时间戳（分钟/悬停完整）、checkbox 选中。
 * 覆盖 AC「消息以纯文本 + pre 渲染，user 与 assistant 可区分，时间戳显示到分钟」。
 */

describe("HistoryMessageRow (t211)", () => {
    const ts = new Date("2026-08-04T02:05:07.000Z").getTime();

    it("user 消息渲染为 pre + 角色「用户」", () => {
        render(
            <HistoryMessageRow
                message={{ id: "m1", role: "user", text: "第一行\n第二行", timestamp: ts }}
                selected={false}
                onToggle={() => undefined}
            />,
        );
        const text = screen.getByText(/第一行/);
        expect(text.tagName).toBe("PRE");
        expect(screen.getByText("用户")).toBeTruthy();
    });

    it("assistant 消息角色为「Agent」", () => {
        render(
            <HistoryMessageRow
                message={{ id: "m2", role: "assistant", text: "回复", timestamp: ts }}
                selected={false}
                onToggle={() => undefined}
            />,
        );
        expect(screen.getByText("Agent")).toBeTruthy();
    });

    it("时间戳显示到分钟，悬停 title 显示完整时间", () => {
        render(
            <HistoryMessageRow
                message={{ id: "m3", role: "user", text: "x", timestamp: ts }}
                selected={false}
                onToggle={() => undefined}
            />,
        );
        const time = screen.getByText(format_time_short(ts));
        expect(time.getAttribute("title")).toBe(format_time_full(ts));
    });

    it("timestamp 为 null 时不渲染时间（grok 无时间）", () => {
        const { container } = render(
            <HistoryMessageRow
                message={{ id: "m4", role: "user", text: "x", timestamp: null }}
                selected={false}
                onToggle={() => undefined}
            />,
        );
        expect(container.querySelector(".history-msg-time")).toBeNull();
    });

    it("checkbox 勾选态与点击回调", () => {
        const onToggle = vi.fn();
        render(
            <HistoryMessageRow
                message={{ id: "m5", role: "user", text: "x", timestamp: ts }}
                selected={true}
                onToggle={onToggle}
            />,
        );
        const check = screen.getByRole("checkbox");
        expect((check as HTMLInputElement).checked).toBe(true);
        fireEvent.click(check);
        expect(onToggle).toHaveBeenCalledWith("m5");
    });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { VirtualMessageList } from "../../../../../src/renderer/components/workspace/VirtualMessageList";
import type { HistoryMessageLike } from "../../../../../src/shared/types/ipc";

function make_message(id: string, text: string): HistoryMessageLike {
    return { id, role: "user", text, timestamp: null };
}

// t377 AC-003: mock scrollElement（jsdom 无真实布局，显式 scrollTop 可断言）。
function make_scroll_element(): HTMLDivElement {
    const element = {
        scrollTop: 0,
        clientHeight: 600,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
    } as unknown as HTMLDivElement;
    return element;
}

function render_list(props: {
    messages: readonly HistoryMessageLike[];
    scrollElement: HTMLDivElement;
    scrollToId?: string | null;
}) {
    return render(
        <VirtualMessageList
            messages={props.messages}
            scrollElement={props.scrollElement}
            estimateHeight={40}
            overscan={5}
            renderItem={(m) => <span>{m.text}</span>}
            scrollToId={props.scrollToId ?? null}
        />,
    );
}

describe("VirtualMessageList", () => {
    it("scrolls to the target message top when scrollToId changes (t377 AC-003)", () => {
        const scroll_element = make_scroll_element();
        const messages = [
            make_message("m1", "first"),
            make_message("m2", "second"),
            make_message("m3", "third"),
        ];
        render_list({ messages, scrollElement: scroll_element, scrollToId: "m3" });

        // 无 heights → 全 estimateHeight=40；m3 顶部偏移 = 2 * 40 = 80。
        expect(scroll_element.scrollTop).toBe(80);
        expect(screen.getByText("third")).toBeDefined();
    });

    it("re-scrolls when scrollToId changes to a new target (t377 AC-003)", () => {
        const scroll_element = make_scroll_element();
        const messages = [
            make_message("m1", "first"),
            make_message("m2", "second"),
            make_message("m3", "third"),
        ];
        const { rerender } = render_list({
            messages,
            scrollElement: scroll_element,
            scrollToId: "m3",
        });
        expect(scroll_element.scrollTop).toBe(80);

        // scrollToId 变更（m3→m2）应重新定位到新目标顶部（t377 f001：原「同 id
        // 去重」用例因 rerender deps 全等使 effect 不重跑，无法区分守卫与 deps；
        // 改验证 id 变更真触发定位路径）。
        scroll_element.scrollTop = 10;
        rerender(
            <VirtualMessageList
                messages={messages}
                scrollElement={scroll_element}
                estimateHeight={40}
                overscan={5}
                renderItem={(m) => <span>{m.text}</span>}
                scrollToId="m2"
            />,
        );
        expect(scroll_element.scrollTop).toBe(40);
    });

    it("compensates scrollTop by estimated prepend offset when messages prepended (t377 AC-003)", () => {
        const scroll_element = make_scroll_element();
        const first = [make_message("m1", "first"), make_message("m2", "second")];
        const { rerender } = render_list({ messages: first, scrollElement: scroll_element });

        // prepend 前 scrollTop 已滚动到后续消息（模拟用户在旧列表某处）。
        scroll_element.scrollTop = 20;

        const prepended = [
            make_message("m0", "new head"),
            make_message("m1", "first"),
            make_message("m2", "second"),
        ];
        rerender(
            <VirtualMessageList
                messages={prepended}
                scrollElement={scroll_element}
                estimateHeight={40}
                overscan={5}
                renderItem={(m) => <span>{m.text}</span>}
            />,
        );

        // old_first_id=m1 新 offset=40（m0 高度）→ scrollTop 20+40=60。
        expect(scroll_element.scrollTop).toBe(60);
    });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it } from "vitest";
import { PaneMessageRow } from "../../../../../src/renderer/components/workspace/PaneMessageRow";
import type { HistoryMessageLike } from "../../../../../src/shared/types/ipc";

/** t237 PaneMessageRow memo 化测试：仅变化行重渲染。 */

function msg(id: string, role: "user" | "assistant", text: string): HistoryMessageLike {
    return { id, role, text, timestamp: 0 };
}

describe("PaneMessageRow memo (t237)", () => {
    it("切换一条消息的选中态时，仅目标行重渲染", () => {
        const messages = [
            msg("m1", "user", "第一条"),
            msg("m2", "assistant", "第二条"),
            msg("m3", "user", "第三条"),
        ];
        const counts = { m1: 0, m2: 0, m3: 0 };
        const onRenderById: Record<string, () => void> = {
            m1: () => {
                counts.m1 += 1;
            },
            m2: () => {
                counts.m2 += 1;
            },
            m3: () => {
                counts.m3 += 1;
            },
        };
        function getOnRender(id: string): () => void {
            return onRenderById[id] ?? (() => undefined);
        }

        function Parent() {
            const [selected, setSelected] = useState<Set<string>>(new Set());
            const isSelected = useCallback((id: string) => selected.has(id), [selected]);
            const toggle = useCallback((id: string, shift: boolean) => {
                if (shift) return;
                setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(id)) next.delete(id);
                    else next.add(id);
                    return next;
                });
            }, []);
            const hover = useCallback(() => undefined, []);

            return (
                <div>
                    {messages.map((m) => (
                        <PaneMessageRow
                            key={m.id}
                            message={m}
                            selected={isSelected(m.id)}
                            show_time={false}
                            compact={false}
                            on_toggle={toggle}
                            on_hover={hover}
                            onRender={getOnRender(m.id)}
                        />
                    ))}
                </div>
            );
        }

        render(<Parent />);
        expect(counts).toEqual({ m1: 1, m2: 1, m3: 1 });

        // 勾选第二条。
        const checks = screen.getAllByRole("checkbox");
        const target = checks[1];
        if (!target) throw new Error("checkbox missing");
        fireEvent.click(target);
        expect(counts).toEqual({ m1: 1, m2: 2, m3: 1 });

        // 取消勾选第二条。
        fireEvent.click(target);
        expect(counts).toEqual({ m1: 1, m2: 3, m3: 1 });
    });
});

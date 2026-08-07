import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { use_provider_tab_drag } from "../../../../src/renderer/hooks/use_provider_tab_drag";

describe("use_provider_tab_drag", () => {
    const providers = ["codex", "antigravity", "kimi", "tavily", "firecrawl"];

    it("reorders providers when dragged past the midpoint of another tab", () => {
        const on_reorder = vi.fn();
        const { result } = renderHook(() =>
            use_provider_tab_drag({ orderedProviders: providers, onReorder: on_reorder }),
        );

        act(() => {
            result.current.handle_drag_start("kimi");
        });
        expect(result.current.drag_id).toBe("kimi");

        act(() => {
            result.current.handle_drag_over("tavily", 100, {
                left: 0,
                width: 100,
            } as DOMRect);
        });

        expect(result.current.over_id).toBe("tavily");
        expect(on_reorder).toHaveBeenCalledWith([
            "codex",
            "antigravity",
            "tavily",
            "kimi",
            "firecrawl",
        ]);
    });

    it("does not reorder when pointer is before the midpoint", () => {
        const on_reorder = vi.fn();
        const { result } = renderHook(() =>
            use_provider_tab_drag({ orderedProviders: providers, onReorder: on_reorder }),
        );

        act(() => {
            result.current.handle_drag_start("kimi");
        });

        act(() => {
            // pointer at 10, midpoint at 50 → no swap
            result.current.handle_drag_over("tavily", 10, {
                left: 0,
                width: 100,
            } as DOMRect);
        });

        expect(on_reorder).not.toHaveBeenCalled();
    });

    it("clears drag state on drag end", () => {
        const on_reorder = vi.fn();
        const { result } = renderHook(() =>
            use_provider_tab_drag({ orderedProviders: providers, onReorder: on_reorder }),
        );

        act(() => {
            result.current.handle_drag_start("kimi");
        });
        act(() => {
            result.current.handle_drag_enter("tavily");
        });
        expect(result.current.drag_id).toBe("kimi");
        expect(result.current.over_id).toBe("tavily");

        act(() => {
            result.current.handle_drag_end();
        });
        expect(result.current.drag_id).toBeNull();
        expect(result.current.over_id).toBeNull();
    });

    it("ignores drag over the same provider", () => {
        const on_reorder = vi.fn();
        const { result } = renderHook(() =>
            use_provider_tab_drag({ orderedProviders: providers, onReorder: on_reorder }),
        );

        act(() => {
            result.current.handle_drag_start("kimi");
            result.current.handle_drag_over("kimi", 100, {
                left: 0,
                width: 100,
            } as DOMRect);
        });

        expect(on_reorder).not.toHaveBeenCalled();
        expect(result.current.over_id).toBeNull();
    });
});

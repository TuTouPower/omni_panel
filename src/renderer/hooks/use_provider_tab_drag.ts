/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useCallback } from "react";
import { compute_drag_reorder } from "../lib/drag-reorder";

export interface UseProviderTabDragParams {
    orderedProviders: readonly string[];
    onReorder: (next: string[]) => void;
}

export interface UseProviderTabDragResult {
    drag_id: string | null;
    over_id: string | null;
    handle_drag_start: (provider: string) => void;
    handle_drag_enter: (provider: string) => void;
    handle_drag_over: (provider: string, clientX: number, rect: DOMRect) => void;
    handle_drag_end: () => void;
}

/**
 * Drag-and-drop reordering for the provider tab strip.
 *
 * Tabs are laid out in a single horizontal row, so reordering uses the
 * direction-aware midpoint guard on the x-axis.
 */
export function use_provider_tab_drag(params: UseProviderTabDragParams): UseProviderTabDragResult {
    const { orderedProviders, onReorder } = params;
    const [drag_id, set_drag_id] = useState<string | null>(null);
    const [over_id, set_over_id] = useState<string | null>(null);

    const handle_drag_start = useCallback((provider: string) => {
        set_drag_id(provider);
    }, []);

    const handle_drag_enter = useCallback(
        (provider: string) => {
            if (!drag_id || drag_id === provider) return;
            set_over_id(provider);
        },
        [drag_id],
    );

    const handle_drag_over = useCallback(
        (provider: string, clientX: number, rect: DOMRect) => {
            if (!drag_id || drag_id === provider) return;
            set_over_id(provider);
            const next = compute_drag_reorder(
                orderedProviders,
                drag_id,
                provider,
                {
                    pointer_y: 0,
                    rect_top: 0,
                    rect_height: 0,
                    pointer_x: clientX,
                    rect_left: rect.left,
                    rect_width: rect.width,
                },
                "x",
            );
            if (next) onReorder(next);
        },
        [drag_id, orderedProviders, onReorder],
    );

    const handle_drag_end = useCallback(() => {
        set_drag_id(null);
        set_over_id(null);
    }, []);

    return {
        drag_id,
        over_id,
        handle_drag_start,
        handle_drag_enter,
        handle_drag_over,
        handle_drag_end,
    };
}

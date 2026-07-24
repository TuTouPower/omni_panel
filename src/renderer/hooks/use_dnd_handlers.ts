/* eslint-disable react-hooks/rules-of-hooks */
import { useState, useCallback } from "react";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import { compute_drag_reorder, build_reorder_base } from "../lib/drag-reorder";

export interface UseDndHandlersParams {
    orderedProviders: readonly string[];
    activeGroup: ProviderUsageGroup | undefined;
    activeTab: string;
    set_provider_order: (update: (prev: string[]) => string[]) => void;
    set_account_orders: (
        update: (prev: Record<string, string[]>) => Record<string, string[]>,
    ) => void;
}

export interface UseDndHandlersResult {
    drag_id: string | null;
    over_id: string | null;
    account_drag_id: string | null;
    account_over_id: string | null;
    handle_drag_start: (provider: string, rect?: DOMRect) => void;
    handle_drag_enter: (provider: string) => void;
    handle_drag_over: (provider: string, clientX: number, clientY: number, rect: DOMRect) => void;
    handle_drag_end: () => void;
    handle_account_drag_start: (accountId: string) => void;
    handle_account_drag_enter: (accountId: string) => void;
    handle_account_drag_end: () => void;
}

// 拖拽状态 + 顺序回调封装。provider 卡片重排走方向感知中点守卫；
// account 重排仅在单 provider tab 视图生效。
export function use_dnd_handlers(params: UseDndHandlersParams): UseDndHandlersResult {
    const { orderedProviders, activeGroup, activeTab, set_provider_order, set_account_orders } =
        params;

    const [drag_id, set_drag_id] = useState<string | null>(null);
    // Drag-card rect captured on dragStart; picks reorder axis (same row →
    // "x" horizontal guard, else "y" vertical guard) for T004 D2=B.
    const [drag_rect, set_drag_rect] = useState<DOMRect | null>(null);
    const [over_id, set_over_id] = useState<string | null>(null);
    const [account_drag_id, set_account_drag_id] = useState<string | null>(null);
    const [account_over_id, set_account_over_id] = useState<string | null>(null);

    // Drag-and-drop handlers for provider card reordering
    const handle_drag_start = useCallback((provider: string, rect?: DOMRect) => {
        set_drag_id(provider);
        set_drag_rect(rect ?? null);
    }, []);

    const handle_drag_enter = useCallback(
        (provider: string) => {
            if (!drag_id || drag_id === provider) return;
            set_over_id(provider);
        },
        [drag_id],
    );

    // Reorder uses a direction-aware midpoint guard (see compute_drag_reorder).
    // Axis is picked from drag-card vs over-card rects: same row (top close)
    // → "x" horizontal guard for multi-column grids (T004 D2=B); otherwise
    // "y" vertical guard with anti-flicker for single-column lists.
    const handle_drag_over = useCallback(
        (provider: string, clientX: number, clientY: number, rect: DOMRect) => {
            if (!drag_id || drag_id === provider) return;
            set_over_id(provider);
            set_provider_order((prev) => {
                const base = build_reorder_base(prev, orderedProviders);
                const same_row =
                    drag_rect !== null && Math.abs(drag_rect.top - rect.top) < rect.height / 2;
                const axis: "x" | "y" = same_row ? "x" : "y";
                const next = compute_drag_reorder(
                    base,
                    drag_id,
                    provider,
                    {
                        pointer_y: clientY,
                        rect_top: rect.top,
                        rect_height: rect.height,
                        pointer_x: clientX,
                        rect_left: rect.left,
                        rect_width: rect.width,
                    },
                    axis,
                );
                return next ?? prev;
            });
        },
        [drag_id, drag_rect, orderedProviders, set_provider_order],
    );

    const handle_drag_end = useCallback(() => {
        set_drag_id(null);
        set_over_id(null);
        set_drag_rect(null);
    }, []);

    // Account drag handlers for single-provider tab view
    const handle_account_drag_start = useCallback((accountId: string) => {
        set_account_drag_id(accountId);
    }, []);

    const handle_account_drag_enter = useCallback(
        (accountId: string) => {
            if (!account_drag_id || account_drag_id === accountId) return;
            set_account_over_id(accountId);
            if (!activeGroup) return;
            const tabKey = activeTab;
            set_account_orders((prev) => {
                const baseIds = (prev[tabKey] ?? activeGroup.accounts.map((a) => a.id)).filter(
                    (id) => activeGroup.accounts.some((a) => a.id === id),
                );
                const from = baseIds.indexOf(account_drag_id);
                const to = baseIds.indexOf(accountId);
                if (from < 0 || to < 0) return prev;
                const next = [...baseIds];
                next.splice(from, 1);
                next.splice(to, 0, account_drag_id);
                return { ...prev, [tabKey]: next };
            });
        },
        [account_drag_id, activeGroup, activeTab, set_account_orders],
    );

    const handle_account_drag_end = useCallback(() => {
        set_account_drag_id(null);
        set_account_over_id(null);
    }, []);

    return {
        drag_id,
        over_id,
        account_drag_id,
        account_over_id,
        handle_drag_start,
        handle_drag_enter,
        handle_drag_over,
        handle_drag_end,
        handle_account_drag_start,
        handle_account_drag_enter,
        handle_account_drag_end,
    };
}

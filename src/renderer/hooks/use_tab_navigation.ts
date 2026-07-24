/* eslint-disable react-hooks/rules-of-hooks */
import { useEffect, useRef, type RefObject } from "react";

export interface UseTabNavigationParams {
    tabsRef: RefObject<HTMLDivElement | null>;
    activeTab: string;
    orderedProviders: readonly string[];
    setActiveTab: (update: string | ((cur: string) => string)) => void;
}

// Tab strip 两个交互 effect：
// 1. active tab 自动滚入视口（居中）。
// 2. 滚轮在 tab strip 上逐格切换（环绕），200ms 节流防抖。
export function use_tab_navigation(params: UseTabNavigationParams): void {
    const { tabsRef, activeTab, orderedProviders, setActiveTab } = params;
    const wheel_at_ref = useRef(0);

    // auto-scroll active tab into view
    useEffect(() => {
        const el = tabsRef.current?.querySelector(`[data-tab="${activeTab}"]`);
        if (el && "scrollIntoView" in el) {
            (el as HTMLElement).scrollIntoView({ behavior: "smooth", inline: "center" });
        }
    }, [activeTab, tabsRef]);

    // wheel over the tab strip steps the selection one tab at a time (wraps around)
    useEffect(() => {
        const el = tabsRef.current;
        if (!el) return;
        const on_wheel = (e: WheelEvent) => {
            const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
            if (!d) return;
            e.preventDefault();
            const now = Date.now();
            if (now - wheel_at_ref.current < 200) return;
            wheel_at_ref.current = now;
            const dir = d > 0 ? 1 : -1;
            setActiveTab((cur) => {
                const tab_order: string[] = ["overview", ...orderedProviders];
                const i = tab_order.indexOf(cur);
                const n = tab_order.length;
                if (n === 0) return cur;
                const ni = (((i + dir) % n) + n) % n;
                return tab_order[ni] ?? cur;
            });
        };
        el.addEventListener("wheel", on_wheel, { passive: false });
        return () => {
            el.removeEventListener("wheel", on_wheel);
        };
    }, [orderedProviders, tabsRef, setActiveTab]);
}

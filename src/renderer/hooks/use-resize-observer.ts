import { useEffect, type RefObject } from "react";

export function useResizeObserver(
    ref: RefObject<HTMLElement | null>,
    onResize: () => void,
    deps: unknown[] = [],
): void {
    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        onResize();

        if (typeof ResizeObserver === "undefined") return;

        const observer = new ResizeObserver(() => {
            onResize();
        });
        observer.observe(el);

        return () => {
            observer.disconnect();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- deps are caller-controlled
    }, [ref, onResize, ...deps]);
}

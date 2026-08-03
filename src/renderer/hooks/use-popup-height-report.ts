/* eslint-disable react-hooks/rules-of-hooks */
import { useEffect, useRef } from "react";

/**
 * Reports popup content height to the main process via the preload bridge.
 *
 * Observes a single offscreen mirror container rendered at `height: auto`
 * with the current collapse state. Its `offsetHeight` is the desired content
 * height (what the BrowserWindow should grow to fit).
 *
 * t196 AC3: the all-collapsed minimum height is no longer measured from a
 * second mirror tree. PopupView caches it in `collapsedMinRef`, re-measuring
 * only on structural changes by briefly forcing the single mirror into the
 * all-collapsed state. `measuring` is true while that transient pass runs so
 * this hook does not report the mirror's collapsed height as content height.
 *
 * Debounce is delegated to the main-side controller; this hook only suppresses
 * exact-duplicate reports to avoid waking the IPC bridge on every paint.
 */
export function use_popup_height_report(
    contentMirrorRef: React.RefObject<HTMLElement | null>,
    collapsedMinRef: React.RefObject<number>,
    measuring: boolean,
): void {
    const last_content_ref = useRef<number | null>(null);
    const last_collapsed_ref = useRef<number | null>(null);

    useEffect(() => {
        const content_el = contentMirrorRef.current;
        if (!content_el) return;

        const api = window.usageboard;

        const report = (): void => {
            if (measuring) return;
            const content_height = content_el.offsetHeight;
            const collapsed_min_height = collapsedMinRef.current;
            if (
                last_content_ref.current === content_height &&
                last_collapsed_ref.current === collapsed_min_height
            ) {
                return;
            }
            last_content_ref.current = content_height;
            last_collapsed_ref.current = collapsed_min_height;
            api.popup.report_content_height({
                content_height,
                collapsed_min_height,
            });
        };

        report();

        if (typeof ResizeObserver === "undefined") {
            return;
        }

        const observer = new ResizeObserver(() => {
            report();
        });
        observer.observe(content_el);

        return () => {
            observer.disconnect();
        };
    }, [contentMirrorRef, collapsedMinRef, measuring]);
}

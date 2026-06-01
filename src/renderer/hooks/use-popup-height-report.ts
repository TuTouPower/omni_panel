import { useEffect, useRef } from "react";

/**
 * Reports popup content height to the main process via the preload bridge.
 *
 * Observes two offscreen mirror containers:
 *   - `contentMirrorRef`: mirror of the live popup with current collapse state,
 *     rendered at `height: auto`. Its `offsetHeight` is the desired content
 *     height (what the BrowserWindow should grow to fit).
 *   - `collapsedMirrorRef`: mirror with every collapsible card forced into
 *     the collapsed state. Its `offsetHeight` is the deterministic minimum
 *     height the main process will clamp to.
 *
 * The live visible `.window` is sized to the BrowserWindow viewport (height:
 * 100vh) so its own offsetHeight is not the desired content height — we must
 * use a mirror to ask "how tall would the popup like to be?".
 *
 * Debounce is delegated to the main-side controller; this hook only suppresses
 * exact-duplicate reports to avoid waking the IPC bridge on every paint.
 */
export function usePopupHeightReport(
    contentMirrorRef: React.RefObject<HTMLElement | null>,
    collapsedMirrorRef: React.RefObject<HTMLElement | null>,
): void {
    const last_content_ref = useRef<number | null>(null);
    const last_collapsed_ref = useRef<number | null>(null);

    useEffect(() => {
        const content_el = contentMirrorRef.current;
        const collapsed_el = collapsedMirrorRef.current;
        if (!content_el || !collapsed_el) return;

        const api = window.usageboard;

        const report = (): void => {
            const content_height = content_el.offsetHeight;
            const collapsed_min_height = collapsed_el.offsetHeight;
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
        observer.observe(collapsed_el);

        return () => {
            observer.disconnect();
        };
    }, [contentMirrorRef, collapsedMirrorRef]);
}

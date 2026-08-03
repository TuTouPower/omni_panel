import { useState, useEffect } from "react";

const TICK_INTERVAL_MS = 30_000;

/**
 * Returns a Date.now() snapshot that re-evaluates every 30 seconds.
 * Used to keep relative-time displays up-to-date without user interaction.
 *
 * t194 AC3: hidden windows must not keep foreground timers busy. While the
 * document is hidden the ticker is paused (no state update, no re-render);
 * on the next visibility change back to visible it refreshes immediately.
 */
export function useNowTick(): number {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        let visible = document.visibilityState !== "hidden";
        const on_visibility = () => {
            const next = document.visibilityState !== "hidden";
            if (next && !visible) {
                setNow(Date.now());
            }
            visible = next;
        };
        const id = setInterval(() => {
            if (visible) {
                setNow(Date.now());
            }
        }, TICK_INTERVAL_MS);
        document.addEventListener("visibilitychange", on_visibility);
        return () => {
            clearInterval(id);
            document.removeEventListener("visibilitychange", on_visibility);
        };
    }, []);

    return now;
}

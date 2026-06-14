import { useState, useEffect } from "react";

const TICK_INTERVAL_MS = 30_000;

/**
 * Returns a Date.now() snapshot that re-evaluates every 30 seconds.
 * Used to keep relative-time displays up-to-date without user interaction.
 */
export function useNowTick(): number {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        const id = setInterval(() => {
            setNow(Date.now());
        }, TICK_INTERVAL_MS);
        return () => {
            clearInterval(id);
        };
    }, []);

    return now;
}

import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useNowTick } from "../../../../src/renderer/hooks/use-now-tick";

describe("useNowTick", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns initial Date.now() snapshot", () => {
        const now = new Date("2026-01-01T12:00:00Z");
        vi.setSystemTime(now);
        const { result } = renderHook(() => useNowTick());
        expect(result.current).toBe(now.getTime());
    });

    it("updates value after 30 seconds", () => {
        const start = new Date("2026-01-01T12:00:00Z");
        vi.setSystemTime(start);
        const { result } = renderHook(() => useNowTick());
        const initial = result.current;

        act(() => {
            vi.advanceTimersByTime(30_000);
            vi.setSystemTime(new Date("2026-01-01T12:00:30Z"));
        });

        expect(result.current).toBeGreaterThan(initial);
        expect(result.current - initial).toBeGreaterThanOrEqual(30_000);
    });

    it("cleans up interval on unmount", () => {
        const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
        const { unmount } = renderHook(() => useNowTick());
        unmount();
        expect(clearIntervalSpy).toHaveBeenCalled();
        clearIntervalSpy.mockRestore();
    });
});

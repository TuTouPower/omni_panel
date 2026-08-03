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

    describe("visibility degradation (t194 AC3)", () => {
        const set_visibility = (state: "visible" | "hidden") => {
            Object.defineProperty(document, "visibilityState", {
                value: state,
                configurable: true,
            });
        };
        afterEach(() => {
            delete (document as unknown as { visibilityState?: string }).visibilityState;
        });

        it("does not advance while the document is hidden", () => {
            const start = new Date("2026-01-01T12:00:00Z");
            vi.setSystemTime(start);
            set_visibility("hidden");
            const { result } = renderHook(() => useNowTick());
            const initial = result.current;

            act(() => {
                vi.advanceTimersByTime(60_000);
                vi.setSystemTime(new Date("2026-01-01T12:01:00Z"));
            });

            expect(result.current).toBe(initial);
        });

        it("refreshes immediately when the document becomes visible again", () => {
            const start = new Date("2026-01-01T12:00:00Z");
            vi.setSystemTime(start);
            set_visibility("hidden");
            const { result } = renderHook(() => useNowTick());
            const initial = result.current;

            act(() => {
                vi.setSystemTime(new Date("2026-01-01T12:00:05Z"));
                set_visibility("visible");
                document.dispatchEvent(new Event("visibilitychange"));
            });

            expect(result.current).toBeGreaterThan(initial);
        });

        it("stops advancing when a visible document hides (production path)", () => {
            const start = new Date("2026-01-01T12:00:00Z");
            vi.setSystemTime(start);
            const { result } = renderHook(() => useNowTick());
            const initial = result.current;

            act(() => {
                set_visibility("hidden");
                document.dispatchEvent(new Event("visibilitychange"));
                vi.advanceTimersByTime(60_000);
                vi.setSystemTime(new Date("2026-01-01T12:01:00Z"));
            });

            expect(result.current).toBe(initial);
        });
    });
});

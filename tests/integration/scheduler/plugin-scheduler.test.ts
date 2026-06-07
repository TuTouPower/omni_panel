import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createPluginScheduler } from "../../../src/main/core/scheduler/plugin-scheduler";

describe("plugin-scheduler", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("calls refresh immediately on start", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 10);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith("p1");
    });

    it("calls refresh on interval", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 10);
        expect(refresh).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(3);
    });

    it("stops calling after stop", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 10);
        scheduler.stop("p1");
        vi.advanceTimersByTime(20_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("enforces minimum interval of 5 seconds", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 2);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("refreshNow calls refresh", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 10);
        scheduler.refreshNow("p1");
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("stopAll stops all schedulers", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 10);
        scheduler.start("p2", 10);
        scheduler.stopAll();
        vi.advanceTimersByTime(20_000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("does not call refresh immediately when immediate:false", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 10, { immediate: false });
        expect(refresh).toHaveBeenCalledTimes(0);
    });

    it("still calls refresh on interval when immediate:false", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createPluginScheduler({ refresh });
        scheduler.start("p1", 10, { immediate: false });
        expect(refresh).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });
});

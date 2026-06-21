import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createConnectorScheduler } from "../../../src/main/core/scheduler/connector-scheduler";

describe("connector-scheduler", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("calls refresh immediately on start", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith("p1");
    });

    it("calls refresh on interval", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10);
        expect(refresh).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(3);
    });

    it("stops calling after stop", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10);
        scheduler.stop("p1");
        vi.advanceTimersByTime(20_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("enforces minimum interval of 5 seconds", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 2);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("refreshNow calls refresh", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10);
        scheduler.refreshNow("p1");
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("stopAll stops all schedulers", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10);
        scheduler.start("p2", 10);
        scheduler.stopAll();
        vi.advanceTimersByTime(20_000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("does not call refresh immediately when immediate:false", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10, { immediate: false });
        expect(refresh).toHaveBeenCalledTimes(0);
    });

    it("still calls refresh on interval when immediate:false", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10, { immediate: false });
        expect(refresh).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("multiple connectors run independently without cross-interference", async () => {
        const refresh = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10);
        scheduler.start("p2", 20);

        expect(scheduler.isRunning("p1")).toBe(true);
        expect(scheduler.isRunning("p2")).toBe(true);

        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledWith("p1");
        expect(refresh).toHaveBeenCalledWith("p2");

        scheduler.stop("p1");
        expect(scheduler.isRunning("p1")).toBe(false);
        expect(scheduler.isRunning("p2")).toBe(true);

        await vi.advanceTimersByTimeAsync(20_000);
        expect(scheduler.isRunning("p2")).toBe(true);
    });

    it("does not stack calls when refresh takes longer than interval", async () => {
        // With setInterval, a slow refresh would cause calls to pile up.
        // With recursive setTimeout, the next call is scheduled only after
        // the current one completes, so no stacking occurs.
        let resolveRefresh: () => void = () => undefined;
        const refresh = vi.fn<() => Promise<void>>().mockImplementation(() => {
            return new Promise<void>((resolve) => {
                resolveRefresh = resolve;
            });
        });
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10, { immediate: false });

        // Advance past one interval — first scheduled call fires
        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(1);

        // Advance past another interval while first refresh is still running.
        // With setInterval this would have already queued a second call.
        // With setTimeout, the next call isn't scheduled yet.
        await vi.advanceTimersByTimeAsync(15_000);
        expect(refresh).toHaveBeenCalledTimes(1); // still 1 — no stacking

        // Now resolve the first refresh — next call should be scheduled
        resolveRefresh();
        await vi.advanceTimersByTimeAsync(0); // let microtasks settle
        // The next refresh is now scheduled after the interval
        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});

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

    it("enforces minimum interval of 5 seconds", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        // Request interval of 2s — should be clamped to 5s (MIN_REFRESH_INTERVAL_SECONDS)
        scheduler.start("p1", 2);
        expect(refresh).toHaveBeenCalledTimes(1);

        // Advance 2s (the requested interval) — should NOT have ticked yet
        await vi.advanceTimersByTimeAsync(2_000);
        expect(refresh).toHaveBeenCalledTimes(1);

        // Advance 3s more (total 5s) — now the clamped interval has elapsed
        await vi.advanceTimersByTimeAsync(3_000);
        expect(refresh).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenLastCalledWith("p1");
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

    it("fires refresh on each interval regardless of previous completion", async () => {
        // The scheduler fires refresh on every interval (fire-and-forget).
        // Concurrent protection is handled by the refresh service's lock,
        // not by the scheduler waiting for completion.
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
        // The scheduler fires a second attempt (the refresh service lock
        // prevents actual concurrent execution).
        await vi.advanceTimersByTimeAsync(15_000);
        expect(refresh).toHaveBeenCalledTimes(2);

        // Resolve the first refresh — no effect on scheduling
        resolveRefresh();
        await vi.advanceTimersByTimeAsync(0); // let microtasks settle
        // The next refresh is still scheduled after the interval
        await vi.advanceTimersByTimeAsync(10_000);
        expect(refresh).toHaveBeenCalledTimes(3);
    });

    it("survives a refresh that never resolves (regression: scheduler death)", async () => {
        // Regression: previously, schedule_next() was inside refresh().then(),
        // so a hanging refresh killed the scheduler permanently.
        const refresh = vi.fn<() => Promise<void>>().mockReturnValue(new Promise(() => undefined));
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10, { immediate: false });

        // Advance through 5 intervals — none should block
        await vi.advanceTimersByTimeAsync(50_000);
        expect(refresh).toHaveBeenCalledTimes(5);
    });

    it("survives a refresh that rejects (regression: unhandled rejection)", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("boom"));
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 10, { immediate: false });

        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(3);
    });

    it("one hanging connector does not block other connectors (regression: all accounts stop)", async () => {
        const hangRefresh = vi
            .fn<() => Promise<void>>()
            .mockReturnValue(new Promise(() => undefined));
        const normalRefresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({
            refresh: (id: string) => (id === "hanger" ? hangRefresh() : normalRefresh()),
        });
        scheduler.start("hanger", 10, { immediate: false });
        scheduler.start("normal", 10, { immediate: false });

        await vi.advanceTimersByTimeAsync(30_000);
        expect(hangRefresh).toHaveBeenCalledTimes(3);
        expect(normalRefresh).toHaveBeenCalledTimes(3);
    });

    it("staggers start when peers already running (regression: TLS handshake burst)", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        // First instance starts immediately (no peers)
        scheduler.start("p1", 10);
        expect(refresh).toHaveBeenCalledTimes(1);

        // Second instance should not fire immediately — stagger applied
        scheduler.start("p2", 10);
        expect(refresh).toHaveBeenCalledTimes(1);

        // After advancing past STAGGER_MAX_MS (3000ms), second fires
        vi.advanceTimersByTime(3_000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("no stagger when only one instance starts (no peers)", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("solo", 10);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith("solo");
    });
});

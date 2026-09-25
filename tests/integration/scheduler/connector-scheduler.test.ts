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
        scheduler.start("p1", 30);
        expect(refresh).toHaveBeenCalledTimes(1);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(2);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(3);
    });

    it("stops calling after stop", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30);
        scheduler.stop("p1");
        vi.advanceTimersByTime(60_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    // A145 / AC-002: 刷新下限提高至 30s，低于 30s 自动钳制
    it("enforces minimum interval of 30 seconds (A145 / AC-002)", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        // 请求 5s，应被钳制到 30s
        scheduler.start("p1", 5);
        expect(refresh).toHaveBeenCalledTimes(1);

        // 前进 5s，不应触发下一次
        await vi.advanceTimersByTimeAsync(5_000);
        expect(refresh).toHaveBeenCalledTimes(1);

        // 再前进 25s（总计 30s），触发下一次
        await vi.advanceTimersByTimeAsync(25_000);
        expect(refresh).toHaveBeenCalledTimes(2);
        expect(refresh).toHaveBeenLastCalledWith("p1");
    });

    it("refreshNow calls refresh", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30);
        scheduler.refreshNow("p1");
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("stopAll stops all schedulers", () => {
        const refresh = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30); // immediate refresh
        scheduler.start("p2", 30); // jittered (peers present)
        scheduler.stopAll(); // cancels p2's pending jitter too
        vi.advanceTimersByTime(60_000);
        // Only p1's immediate fire remains; p2's jitter was cancelled by stopAll.
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(refresh).toHaveBeenCalledWith("p1");
    });

    it("stop() cancels pending jitter refresh for staggered start (A12)", () => {
        const refresh = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30); // no peers → immediate refresh('p1')
        scheduler.start("p2", 30); // peers present → jitter 0..3000ms
        scheduler.stop("p2"); // before the jitter timer fires
        vi.advanceTimersByTime(5_000); // well past the jitter window
        const p2_calls = refresh.mock.calls.filter((c) => c[0] === "p2").length;
        expect(p2_calls).toBe(0);
    });

    it("stopAll cancels pending jitter refreshes (A12)", () => {
        vi.spyOn(Math, "random").mockReturnValue(0.5);
        const refresh = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30);
        scheduler.start("p2", 30); // jittered 1500ms
        scheduler.stopAll();
        vi.advanceTimersByTime(5_000);
        const p2_calls = refresh.mock.calls.filter((c) => c[0] === "p2").length;
        expect(p2_calls).toBe(0);
    });

    it("does not call refresh immediately when immediate:false", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30, { immediate: false });
        expect(refresh).toHaveBeenCalledTimes(0);
    });

    it("still calls refresh on interval when immediate:false", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30, { immediate: false });
        expect(refresh).toHaveBeenCalledTimes(0);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("multiple connectors run independently without cross-interference", async () => {
        const refresh = vi.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30);
        scheduler.start("p2", 60);

        expect(scheduler.isRunning("p1")).toBe(true);
        expect(scheduler.isRunning("p2")).toBe(true);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledWith("p1");

        scheduler.stop("p1");
        expect(scheduler.isRunning("p1")).toBe(false);
        expect(scheduler.isRunning("p2")).toBe(true);

        await vi.advanceTimersByTimeAsync(30_000);
        expect(scheduler.isRunning("p2")).toBe(true);
    });

    it("fires refresh on each interval regardless of previous completion", async () => {
        let resolveRefresh: () => void = () => undefined;
        const refresh = vi.fn<() => Promise<void>>().mockImplementation(() => {
            return new Promise<void>((resolve) => {
                resolveRefresh = resolve;
            });
        });
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30, { immediate: false });

        // Advance past one interval — first scheduled call fires
        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(1);

        // Advance past another interval while first refresh is still running
        await vi.advanceTimersByTimeAsync(35_000);
        expect(refresh).toHaveBeenCalledTimes(2);

        // Resolve first refresh
        resolveRefresh();
        await vi.advanceTimersByTimeAsync(0);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(3);
    });

    it("survives a refresh that never resolves (regression: scheduler death)", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockReturnValue(new Promise(() => undefined));
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30, { immediate: false });

        // Advance through 5 intervals — none should block
        await vi.advanceTimersByTimeAsync(150_000);
        expect(refresh).toHaveBeenCalledTimes(5);
    });

    it("survives a refresh that rejects (regression: unhandled rejection)", async () => {
        const refresh = vi.fn<() => Promise<void>>().mockRejectedValue(new Error("boom"));
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30, { immediate: false });

        // A145: 连续失败指数退避与 jitter 期间调度器保持存活触发 3 次
        await vi.advanceTimersByTimeAsync(300_000);
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
        scheduler.start("hanger", 30, { immediate: false });
        scheduler.start("normal", 30, { immediate: false });

        await vi.advanceTimersByTimeAsync(90_000);
        expect(hangRefresh).toHaveBeenCalledTimes(3);
        expect(normalRefresh).toHaveBeenCalledTimes(3);
    });

    it("staggers start when peers already running (regression: TLS handshake burst)", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        // First instance starts immediately (no peers)
        scheduler.start("p1", 30);
        expect(refresh).toHaveBeenCalledTimes(1);

        // Second instance should not fire immediately — stagger applied
        scheduler.start("p2", 30);
        expect(refresh).toHaveBeenCalledTimes(1);

        // After advancing past STAGGER_MAX_MS (3000ms), second fires
        vi.advanceTimersByTime(3_000);
        expect(refresh).toHaveBeenCalledTimes(2);
    });

    it("no stagger when only one instance starts (no peers)", () => {
        const refresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("solo", 30);
        expect(refresh).toHaveBeenCalledTimes(1);
    });

    it("A145 / AC-002: applies exponential backoff on consecutive failures", async () => {
        vi.spyOn(Math, "random").mockReturnValue(0); // 消除 jitter 便于精确判定
        const refresh = vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("network failure"));
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30, { immediate: false });

        // 第 1 次调度在 30s 触发并失败 (failures=1)
        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(1);
        expect(scheduler.getFailureCount?.("p1")).toBe(1);

        // 失败 1 次后退避为 60s：前进 30s 不触发，再前进 30s (累计 90s) 触发第 2 次 (failures=2)
        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(2);
        expect(scheduler.getFailureCount?.("p1")).toBe(2);

        // 失败 2 次后退避为 120s：前进 60s 不触发，再前进 60s (累计 210s) 触发第 3 次 (failures=3)
        await vi.advanceTimersByTimeAsync(60_000);
        expect(refresh).toHaveBeenCalledTimes(2);
        await vi.advanceTimersByTimeAsync(60_000);
        expect(refresh).toHaveBeenCalledTimes(3);
        expect(scheduler.getFailureCount?.("p1")).toBe(3);
    });

    it("A145 / AC-002: includes random jitter in exponential backoff delay", async () => {
        // 模拟固定 10% 的随机数抖动
        vi.spyOn(Math, "random").mockReturnValue(0.1);
        const refresh = vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("network failure"));
        const scheduler = createConnectorScheduler({ refresh });
        scheduler.start("p1", 30, { immediate: false });

        // 第 1 次调度在 30s 触发 (failures=1)
        await vi.advanceTimersByTimeAsync(30_000);
        expect(refresh).toHaveBeenCalledTimes(1);

        // 失败 1 次基础退避为 60s，加上 2% 抖动 (0.1 * 0.2 * 60s = 1.2s)，下一次延时为 61.2s
        await vi.advanceTimersByTimeAsync(60_000);
        expect(refresh).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(1_500);
        expect(refresh).toHaveBeenCalledTimes(2);
    });
});

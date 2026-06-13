import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSchedulerOrchestrator } from "../../../src/main/core/scheduler/scheduler-orchestrator";
import type { ConnectorScheduler } from "../../../src/main/core/scheduler/connector-scheduler";
import type { AppConfigStore } from "../../../src/main/core/config/config-store";
import type { AppConfiguration } from "../../../src/main/core/config/types";

function createMockScheduler(): ConnectorScheduler & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        start: (instanceId: string, _interval?: number, options?: { immediate?: boolean }) => {
            calls.push(`start:${instanceId}${options?.immediate === false ? ":deferred" : ""}`);
        },
        stop: (instanceId: string) => {
            calls.push(`stop:${instanceId}`);
        },
        stopAll: () => {
            calls.push("stopAll");
        },
        refreshNow: (instanceId: string) => {
            calls.push(`refreshNow:${instanceId}`);
        },
        isRunning: () => false,
    };
}

function createMockConfigStore(config: AppConfiguration): AppConfigStore & { calls: string[] } {
    const calls: string[] = [];
    return {
        calls,
        load: () => {
            calls.push("load");
            return Promise.resolve(config);
        },
        save: () => {
            calls.push("save");
            return Promise.resolve();
        },
        scheduleSave: () => {
            calls.push("scheduleSave");
        },
        flushPendingSave: () => {
            calls.push("flushPendingSave");
            return Promise.resolve();
        },
        hasPendingSave: () => false,
    };
}

describe("scheduler-orchestrator", () => {
    let scheduler: ReturnType<typeof createMockScheduler>;
    let configStore: ReturnType<typeof createMockConfigStore>;
    let orchestrator: ReturnType<typeof createSchedulerOrchestrator>;

    const config: AppConfiguration = {
        schemaVersion: 1,
        language: "en",
        launchAtLogin: false,
        plugins: [
            {
                instanceId: "a",
                stateId: "a",
                name: "A",
                enabled: true,
                executablePath: "/a",
                refreshIntervalSeconds: 300,
                parameterValues: {},
                endpointOverrides: {},
            },
            {
                instanceId: "b",
                stateId: "b",
                name: "B",
                enabled: false,
                executablePath: "/b",
                refreshIntervalSeconds: 600,
                parameterValues: {},
                endpointOverrides: {},
            },
            {
                instanceId: "c",
                stateId: "c",
                name: "C",
                enabled: true,
                executablePath: "/c",
                refreshIntervalSeconds: 120,
                parameterValues: {},
                endpointOverrides: {},
            },
        ],
    };

    beforeEach(() => {
        vi.useFakeTimers();
        scheduler = createMockScheduler();
        configStore = createMockConfigStore(config);
        orchestrator = createSchedulerOrchestrator({ scheduler, configStore });
    });

    it("startAll only starts enabled connectors", () => {
        orchestrator.startAll(config);
        expect(scheduler.calls).toContain("start:a");
        expect(scheduler.calls).toContain("start:c");
        expect(scheduler.calls).not.toContain("start:b");
    });

    it("rebuild stops all then restarts enabled without immediate refresh", () => {
        orchestrator.rebuild(config);
        expect(scheduler.calls[0]).toBe("stopAll");
        expect(scheduler.calls).toContain("start:a:deferred");
        expect(scheduler.calls).toContain("start:c:deferred");
        expect(scheduler.calls).not.toContain("start:a");
        expect(scheduler.calls).not.toContain("start:c");
    });

    it("suspend stops all", () => {
        orchestrator.suspend();
        expect(scheduler.calls).toContain("stopAll");
    });

    it("resume reloads config and restarts enabled", async () => {
        orchestrator.resume();
        await vi.advanceTimersByTimeAsync(0);
        expect(configStore.calls).toContain("load");
        expect(scheduler.calls).toContain("start:a");
        expect(scheduler.calls).toContain("start:c");
    });

    it("shutdown stops all", () => {
        orchestrator.shutdown();
        expect(scheduler.calls).toContain("stopAll");
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSchedulerOrchestrator } from "../../../src/main/core/scheduler/scheduler-orchestrator";
import type { ConnectorScheduler } from "../../../src/main/core/scheduler/connector-scheduler";
import type { AppConfigStore } from "../../../src/main/core/config/config-store";
import type { AppConfiguration } from "../../../src/main/core/config/types";

interface SchedulerStart {
    instanceId: string;
    interval: number;
    immediate: boolean;
}

function createMockScheduler(): ConnectorScheduler & { starts: SchedulerStart[]; calls: string[] } {
    const starts: SchedulerStart[] = [];
    const calls: string[] = [];
    return {
        starts,
        calls,
        start: (instanceId: string, interval, options?: { immediate?: boolean }) => {
            starts.push({
                instanceId,
                interval,
                immediate: options?.immediate !== false,
            });
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
        orchestrator.suspend("system");
        expect(scheduler.calls).toContain("stopAll");
    });

    it("resume reloads config and restarts enabled", async () => {
        orchestrator.resume("system");
        await vi.advanceTimersByTimeAsync(0);
        expect(configStore.calls).toContain("load");
        expect(scheduler.calls).toContain("start:a");
        expect(scheduler.calls).toContain("start:c");
    });

    it("shutdown stops all", () => {
        orchestrator.shutdown();
        expect(scheduler.calls).toContain("stopAll");
    });

    it("reconcile ignores non-scheduling changes", () => {
        const updated = {
            ...config,
            theme: "dark" as const,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "a"
                    ? {
                          ...plugin,
                          displayName: "Renamed",
                          parameterValues: { token: "changed" },
                          endpointOverrides: { default: "https://example.com" },
                      }
                    : plugin,
            ),
        };

        orchestrator.reconcile(config, updated);

        expect(scheduler.calls).toEqual([]);
    });

    it("reconcile rebuilds when the effective schedule changes", () => {
        const updated = {
            ...config,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "a" ? { ...plugin, refreshIntervalSeconds: 900 } : plugin,
            ),
        };

        orchestrator.reconcile(config, updated);

        expect(scheduler.calls[0]).toBe("stopAll");
        expect(scheduler.calls).toContain("start:a:deferred");
        expect(scheduler.starts.find((entry) => entry.instanceId === "a")?.interval).toBe(900);
    });

    it("reconcile rebuilds when a connector is enabled", () => {
        const updated = {
            ...config,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "b" ? { ...plugin, enabled: true } : plugin,
            ),
        };

        orchestrator.reconcile(config, updated);

        expect(scheduler.calls[0]).toBe("stopAll");
        expect(scheduler.calls).toContain("start:b:deferred");
    });

    it("reconcile ignores interval changes for disabled connectors", () => {
        const updated = {
            ...config,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "b" ? { ...plugin, refreshIntervalSeconds: 900 } : plugin,
            ),
        };

        orchestrator.reconcile(config, updated);

        expect(scheduler.calls).toEqual([]);
    });

    it("reconcile ignores interval changes for manual-only connectors", () => {
        const previous = {
            ...config,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "a" ? { ...plugin, manualRefreshOnly: true } : plugin,
            ),
        };
        const updated = {
            ...previous,
            plugins: previous.plugins.map((plugin) =>
                plugin.instanceId === "a" ? { ...plugin, refreshIntervalSeconds: 900 } : plugin,
            ),
        };

        orchestrator.reconcile(previous, updated);

        expect(scheduler.calls).toEqual([]);
    });

    it("reconcile rebuilds only when a global interval changes an active follow-global connector", () => {
        const follow_global = {
            ...config,
            globalRefreshIntervalSeconds: 300,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "a" ? { ...plugin, refreshIntervalSeconds: 0 } : plugin,
            ),
        };

        orchestrator.reconcile(follow_global, {
            ...follow_global,
            globalRefreshIntervalSeconds: 900,
        });

        expect(scheduler.calls[0]).toBe("stopAll");
        expect(scheduler.starts.find((entry) => entry.instanceId === "a")?.interval).toBe(900);
    });

    it("reconcile ignores plugin order changes", () => {
        orchestrator.reconcile(config, { ...config, plugins: [...config.plugins].reverse() });
        expect(scheduler.calls).toEqual([]);
    });

    it("does not restart schedulers while user pause remains active", async () => {
        orchestrator.suspend("user");
        orchestrator.suspend("system");
        scheduler.calls.length = 0;
        scheduler.starts.length = 0;

        orchestrator.resume("system");
        await vi.advanceTimersByTimeAsync(0);

        expect(scheduler.starts).toEqual([]);
        expect(configStore.calls).not.toContain("load");

        orchestrator.resume("user");
        await vi.advanceTimersByTimeAsync(0);

        expect(configStore.calls).toContain("load");
        expect(scheduler.calls).toContain("start:a");
    });

    it("does not restart schedulers while system suspend remains active", async () => {
        orchestrator.suspend("system");
        orchestrator.suspend("user");
        scheduler.calls.length = 0;
        scheduler.starts.length = 0;

        orchestrator.resume("user");
        await vi.advanceTimersByTimeAsync(0);

        expect(scheduler.starts).toEqual([]);
        expect(configStore.calls).not.toContain("load");

        orchestrator.resume("system");
        await vi.advanceTimersByTimeAsync(0);

        expect(configStore.calls).toContain("load");
        expect(scheduler.calls).toContain("start:a");
    });

    it("reconcile does not start schedulers while suspended", () => {
        orchestrator.suspend("user");
        scheduler.calls.length = 0;
        scheduler.starts.length = 0;
        const updated = {
            ...config,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "a" ? { ...plugin, refreshIntervalSeconds: 900 } : plugin,
            ),
        };

        orchestrator.reconcile(config, updated);

        expect(scheduler.starts).toEqual([]);
    });

    it("resumes with the latest config after a deferred reconcile", async () => {
        const updated = {
            ...config,
            plugins: config.plugins.map((plugin) =>
                plugin.instanceId === "a" ? { ...plugin, refreshIntervalSeconds: 900 } : plugin,
            ),
        };
        configStore.load = () => Promise.resolve(updated);
        orchestrator.suspend("user");
        scheduler.calls.length = 0;
        scheduler.starts.length = 0;

        orchestrator.reconcile(config, updated);
        orchestrator.resume("user");
        await vi.advanceTimersByTimeAsync(0);

        expect(scheduler.starts.find((entry) => entry.instanceId === "a")?.interval).toBe(900);
    });

    describe("follow-global refresh interval (sentinel 0)", () => {
        it("startAll resolves connector interval 0 to globalRefreshIntervalSeconds", () => {
            const follow_global_config: AppConfiguration = {
                schemaVersion: 1,
                language: "en",
                launchAtLogin: false,
                globalRefreshIntervalSeconds: 600,
                plugins: [
                    {
                        instanceId: "follow",
                        stateId: "follow",
                        name: "Follow",
                        enabled: true,
                        executablePath: "/f",
                        refreshIntervalSeconds: 0,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            };
            const s = createMockScheduler();
            const cs = createMockConfigStore(follow_global_config);
            const o = createSchedulerOrchestrator({ scheduler: s, configStore: cs });
            o.startAll(follow_global_config);
            const started = s.starts.find((entry) => entry.instanceId === "follow");
            expect(started).toBeDefined();
            expect(started?.interval).toBe(600);
        });

        it("startAll falls back to 300 when both connector and global are <= 0", () => {
            const follow_global_config: AppConfiguration = {
                schemaVersion: 1,
                language: "en",
                launchAtLogin: false,
                plugins: [
                    {
                        instanceId: "follow",
                        stateId: "follow",
                        name: "Follow",
                        enabled: true,
                        executablePath: "/f",
                        refreshIntervalSeconds: 0,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            };
            const s = createMockScheduler();
            const cs = createMockConfigStore(follow_global_config);
            const o = createSchedulerOrchestrator({ scheduler: s, configStore: cs });
            o.startAll(follow_global_config);
            const started = s.starts.find((entry) => entry.instanceId === "follow");
            expect(started?.interval).toBe(300);
        });

        it("startAll uses connector-specific interval when refreshIntervalSeconds > 0", () => {
            const s = createMockScheduler();
            const cs = createMockConfigStore(config);
            const o = createSchedulerOrchestrator({ scheduler: s, configStore: cs });
            o.startAll(config);
            const c = s.starts.find((entry) => entry.instanceId === "c");
            expect(c?.interval).toBe(120);
        });

        it("rebuild resolves connector interval 0 to globalRefreshIntervalSeconds", () => {
            const follow_global_config: AppConfiguration = {
                schemaVersion: 1,
                language: "en",
                launchAtLogin: false,
                globalRefreshIntervalSeconds: 900,
                plugins: [
                    {
                        instanceId: "follow",
                        stateId: "follow",
                        name: "Follow",
                        enabled: true,
                        executablePath: "/f",
                        refreshIntervalSeconds: 0,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            };
            const s = createMockScheduler();
            const cs = createMockConfigStore(follow_global_config);
            const o = createSchedulerOrchestrator({ scheduler: s, configStore: cs });
            o.rebuild(follow_global_config);
            const started = s.starts.find((entry) => entry.instanceId === "follow");
            expect(started?.interval).toBe(900);
            expect(started?.immediate).toBe(false);
        });
    });
});

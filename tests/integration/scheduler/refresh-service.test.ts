import { describe, it, expect, vi } from "vitest";
import { createRefreshService } from "../../../src/main/core/scheduler/refresh-service";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { AppConfiguration, PluginConfiguration } from "../../../src/main/core/config/types";

const mockConfig: PluginConfiguration = {
    instanceId: "state-1",
    stateId: "state-1",
    name: "test-plugin",
    enabled: true,
    executablePath: "/path/plugin.py",
    refreshIntervalSeconds: 300,
    parameterValues: { API_KEY: "key123" },
    endpointOverrides: {},
};

function createDeps(overrides: Record<string, unknown> = {}) {
    const runtimeStore = createRuntimeStore();
    return {
        runner: vi
            .fn<
                () => Promise<{
                    stdout: string;
                    stderr: string;
                    exitCode: number;
                    durationMs: number;
                }>
            >()
            .mockResolvedValue({
                stdout: JSON.stringify({
                    success: true,
                    schemaVersion: 1,
                    updatedAt: "2026-05-24T12:00:00Z",
                    items: [],
                }),
                stderr: "",
                exitCode: 0,
                durationMs: 100,
            }),
        outputParser: vi.fn().mockReturnValue({
            success: true,
            schemaVersion: 1,
            updatedAt: "2026-05-24T12:00:00Z",
            items: [],
        }),
        commandBuilder: vi
            .fn()
            .mockReturnValue({ command: process.execPath, args: ["/path/plugin.js"] }),
        cacheStore: {
            load: vi.fn<() => Promise<null>>().mockResolvedValue(null),
            save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            delete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
        runtimeStore,
        configStore: {
            load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                schemaVersion: 1,
                language: "zh-Hans",
                overviewDisplayMode: "tabs",
                plugins: [mockConfig],
                launchAtLogin: false,
            }),
            save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            scheduleSave: vi.fn(),
            flushPendingSave: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            hasPendingSave: vi.fn<() => boolean>().mockReturnValue(false),
        },
        secretsStore: {
            get: vi.fn<() => Promise<string | null>>().mockResolvedValue(null),
            set: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            delete: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        },
        secretParamKeys: new Map<string, ReadonlySet<string>>() as ReadonlyMap<
            string,
            ReadonlySet<string>
        >,
        getMetadataEndpoints: vi.fn().mockReturnValue(undefined),
        ...overrides,
    };
}

describe("refresh-service", () => {
    it("skips execution when cache is not expired", async () => {
        const deps = createDeps();
        (deps.cacheStore.load as ReturnType<typeof vi.fn>).mockResolvedValue({
            updatedAt: new Date().toISOString(),
            items: [],
        });
        const service = createRefreshService(deps);
        await service.refresh("state-1");
        expect(deps.runner).not.toHaveBeenCalled();
    });

    it("executes plugin on cache miss", async () => {
        const deps = createDeps();
        const service = createRefreshService(deps);
        await service.refresh("state-1");
        expect(deps.runner).toHaveBeenCalledTimes(1);
    });

    it("saves to cache on success", async () => {
        const deps = createDeps();
        const service = createRefreshService(deps);
        await service.refresh("state-1");
        expect(deps.cacheStore.save).toHaveBeenCalledTimes(1);
    });

    it("force=true skips cache check", async () => {
        const deps = createDeps();
        (deps.cacheStore.load as ReturnType<typeof vi.fn>).mockResolvedValue({
            updatedAt: new Date().toISOString(),
            items: [],
        });
        const service = createRefreshService(deps);
        await service.refresh("state-1", { force: true });
        expect(deps.runner).toHaveBeenCalledTimes(1);
    });

    it("sets runtime to failed on runner error", async () => {
        const deps = createDeps();
        (deps.runner as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("timeout"));
        const service = createRefreshService(deps);
        await service.refresh("state-1");
        const state = deps.runtimeStore.getSnapshot("state-1");
        expect(state.status).toBe("failed");
    });

    it("sets runtime to failed when exit code is non-zero", async () => {
        const deps = createDeps();
        (deps.runner as ReturnType<typeof vi.fn>).mockResolvedValue({
            stdout: JSON.stringify({
                schemaVersion: 1,
                updatedAt: "2026-05-24T12:00:00Z",
                items: [],
            }),
            stderr: "API key invalid",
            exitCode: 1,
            durationMs: 50,
        });
        const service = createRefreshService(deps);
        await service.refresh("state-1");
        const state = deps.runtimeStore.getSnapshot("state-1");
        expect(state.status).toBe("failed");
        expect(state.status === "failed" && state.error).toContain("API key invalid");
        expect(deps.cacheStore.save).not.toHaveBeenCalled();
    });

    it("prevents concurrent refresh for same instance", async () => {
        const deps = createDeps();
        let resolveRunner!: () => void;
        (deps.runner as ReturnType<typeof vi.fn>).mockImplementation(
            () =>
                new Promise<{
                    stdout: string;
                    stderr: string;
                    exitCode: number;
                    durationMs: number;
                }>((resolve) => {
                    resolveRunner = () => {
                        resolve({
                            stdout: "{}",
                            stderr: "",
                            exitCode: 0,
                            durationMs: 0,
                        });
                    };
                }),
        );
        const service = createRefreshService(deps);
        const p1 = service.refresh("state-1");
        // Let first refresh reach the runner call
        await new Promise((r) => setTimeout(r, 0));
        const p2 = service.refresh("state-1");
        resolveRunner();
        await Promise.all([p1, p2]);
        expect(deps.runner).toHaveBeenCalledTimes(1);
    });

    it("refreshAll processes all enabled plugins", async () => {
        const deps = createDeps({
            configStore: {
                load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    overviewDisplayMode: "tabs",
                    plugins: [
                        { ...mockConfig, instanceId: "s1", stateId: "s1", enabled: true },
                        { ...mockConfig, instanceId: "s2", stateId: "s2", enabled: true },
                        { ...mockConfig, instanceId: "s3", stateId: "s3", enabled: false },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            },
        });
        const service = createRefreshService(deps);
        await service.refreshAll();
        expect(deps.runner).toHaveBeenCalledTimes(2);
    });

    it("merges secrets into parameterValues before execution", async () => {
        const secretKeys = new Map<string, ReadonlySet<string>>([
            ["state-1", new Set(["API_KEY"])],
        ]);
        const deps = createDeps({
            secretParamKeys: secretKeys,
        });
        (deps.secretsStore.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
            key === "state-1:API_KEY" ? Promise.resolve("real-secret") : Promise.resolve(null),
        );
        const service = createRefreshService(deps);
        await service.refresh("state-1");
        expect(deps.commandBuilder).toHaveBeenCalledWith(
            "/path/plugin.py",
            expect.objectContaining({ API_KEY: "real-secret" }),
            "zh-Hans",
        );
    });

    it("does not leak secrets when secretParamKeys is empty", async () => {
        const deps = createDeps();
        const service = createRefreshService(deps);
        await service.refresh("state-1");
        expect(deps.commandBuilder).toHaveBeenCalledWith(
            "/path/plugin.py",
            expect.objectContaining({ API_KEY: "key123" }),
            "zh-Hans",
        );
        expect(deps.secretsStore.get).not.toHaveBeenCalled();
    });
});

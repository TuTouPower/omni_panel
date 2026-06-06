import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRefreshService } from "../../../src/main/core/scheduler/refresh-service";
import type { RefreshServiceDeps } from "../../../src/main/core/scheduler/refresh-service";
import { addTransport, setLogLevel } from "../../../src/shared/lib/logger";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import { buildPluginCommand } from "../../../src/main/core/plugin/command-builder";
import { executePlugin } from "../../../src/main/core/plugin/runner";
import { parsePluginResult } from "../../../src/main/core/plugin/output-parser";
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
        runner: vi.fn<RefreshServiceDeps["runner"]>().mockResolvedValue({
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
            exportAll: vi.fn<() => Promise<Record<string, string>>>().mockResolvedValue({}),
            importAll: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
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

    it("passes plugin instance id as source instance id", async () => {
        const tempDir = await mkdtemp(join(tmpdir(), "source-instance-id-test-"));
        const script = join(tempDir, "deepseek-plugin.js");
        const plugin = {
            ...mockConfig,
            instanceId: "deepseek-1",
            stateId: "deepseek-state",
            name: "DeepSeek",
            executablePath: script,
        };
        await writeFile(
            script,
            `console.log(JSON.stringify({
                success: true,
                schemaVersion: 2,
                updatedAt: "2026-05-31T00:00:00Z",
                items: [{
                    id: "deepseek-1:default",
                    provider: "deepseek",
                    source: "api_key",
                    sourceInstanceId: process.env.OMNI_SOURCE_INSTANCE_ID,
                    accountId: process.env.OMNI_SOURCE_INSTANCE_ID,
                    accountLabel: "DeepSeek",
                    name: "DeepSeek",
                    used: 1,
                    limit: 100,
                    displayStyle: "percent",
                    status: "normal"
                }]
            }));`,
        );
        const deps = createDeps({
            runner: executePlugin,
            outputParser: parsePluginResult,
            commandBuilder: (
                executablePath: string,
                parameterValues: Record<string, string>,
                language: AppConfiguration["language"],
            ) => buildPluginCommand(executablePath, parameterValues, language, process.execPath),
            configStore: {
                load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [plugin],
                    launchAtLogin: false,
                }),
                save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
                hasPendingSave: vi.fn<() => boolean>().mockReturnValue(false),
            },
        });
        const service = createRefreshService(deps);

        try {
            await service.refresh(plugin.instanceId, { force: true });
            const snapshot = deps.runtimeStore.getSnapshot(plugin.instanceId);

            expect(snapshot.status).toBe("ready");
            if (snapshot.status !== "ready") return;
            expect(snapshot.items[0]?.sourceInstanceId).toBe("deepseek-1");
            expect(snapshot.items[0]?.accountId).toBe("deepseek-1");
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
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

    it("keeps last successful cache while refresh is loading", async () => {
        const cached = {
            updatedAt: "2026-06-06T12:00:00Z",
            items: [
                {
                    id: "item-1",
                    provider: "claude" as const,
                    source: "cpa" as const,
                    sourceInstanceId: "cpa-1",
                    accountId: "acct-1",
                    accountLabel: "Claude Account",
                    name: "5小时用量",
                    used: 10,
                    limit: 100,
                    displayStyle: "percent" as const,
                    status: "normal" as const,
                },
            ],
        };
        let resolveRunner!: () => void;
        const deps = createDeps({
            runner: vi.fn<RefreshServiceDeps["runner"]>().mockImplementation(
                () =>
                    new Promise<{
                        stdout: string;
                        stderr: string;
                        exitCode: number;
                        durationMs: number;
                    }>((resolve) => {
                        resolveRunner = () => {
                            resolve({
                                stdout: JSON.stringify({
                                    success: true,
                                    schemaVersion: 1,
                                    updatedAt: "2026-06-06T12:05:00Z",
                                    items: [],
                                }),
                                stderr: "",
                                exitCode: 0,
                                durationMs: 10,
                            });
                        };
                    }),
            ),
        });
        (deps.cacheStore.load as ReturnType<typeof vi.fn>).mockResolvedValue(cached);
        const service = createRefreshService(deps);

        const refreshPromise = service.refresh("state-1", { force: true });
        await new Promise((r) => setTimeout(r, 0));

        const loadingState = deps.runtimeStore.getSnapshot("state-1");
        expect(loadingState.status).toBe("loading");
        if (loadingState.status !== "loading") throw new Error("expected loading state");
        expect(loadingState.lastSuccess?.items[0]?.provider).toBe("claude");

        resolveRunner();
        await refreshPromise;
    });

    it("keeps last successful cache when plugin reports an error", async () => {
        const cached = {
            updatedAt: "2026-06-06T12:00:00Z",
            items: [
                {
                    id: "item-1",
                    provider: "claude" as const,
                    source: "cpa" as const,
                    sourceInstanceId: "cpa-1",
                    accountId: "acct-1",
                    accountLabel: "Claude Account",
                    name: "5小时用量",
                    used: 10,
                    limit: 100,
                    displayStyle: "percent" as const,
                    status: "normal" as const,
                },
            ],
        };
        const deps = createDeps();
        (deps.cacheStore.load as ReturnType<typeof vi.fn>).mockResolvedValue(cached);
        deps.outputParser.mockReturnValue({
            success: false,
            error: { code: "FAKE_ERROR", message: "network timeout" },
        });
        const service = createRefreshService(deps);

        await service.refresh("state-1", { force: true });

        const failedState = deps.runtimeStore.getSnapshot("state-1");
        expect(failedState.status).toBe("failed");
        if (failedState.status !== "failed") throw new Error("expected failed state");
        expect(failedState.lastSuccess?.items[0]?.provider).toBe("claude");
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

    it("passes endpoint overrides to runner env", async () => {
        const deps = createDeps({
            configStore: {
                load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                    schemaVersion: 1,
                    language: "zh-Hans",
                    plugins: [
                        {
                            ...mockConfig,
                            endpointOverrides: { default: "https://cpa-manager.example" },
                        },
                    ],
                    launchAtLogin: false,
                }),
                save: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
                scheduleSave: vi.fn(),
                flushPendingSave: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
                hasPendingSave: vi.fn<() => boolean>().mockReturnValue(false),
            },
            getMetadataEndpoints: vi.fn().mockReturnValue({ default: null }),
        });
        const service = createRefreshService(deps);

        await service.refresh("state-1");

        const runnerArgs = deps.runner.mock.calls[0]?.[0] as
            | { env?: Record<string, string> }
            | undefined;
        expect(runnerArgs?.env?.["OMNI_PLUGIN_ENDPOINTS"]).toBe(
            JSON.stringify({
                default: "https://cpa-manager.example",
            }),
        );
        expect(deps.runner).toHaveBeenCalledWith(expect.anything(), { timeoutMs: 15_000 });
    });

    it("logs full plugin stdout, parsed output, and runtime payload", async () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "development";
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        const stdout = JSON.stringify({
            success: true,
            schemaVersion: 1,
            updatedAt: "2026-05-24T12:00:00Z",
            items: [
                {
                    id: "item-1",
                    provider: "deepseek",
                    source: "api_key",
                    sourceInstanceId: "state-1",
                    accountId: "acct-1",
                    accountLabel: "Account 1",
                    name: "5小时用量",
                    used: 50,
                    limit: 100,
                    displayStyle: "percent",
                    resetAt: "2026-05-24T14:00:00Z",
                    status: "normal",
                    color: "green",
                },
            ],
        });
        const output = JSON.parse(stdout) as ReturnType<RefreshServiceDeps["outputParser"]>;
        const deps = createDeps({
            runner: vi.fn<RefreshServiceDeps["runner"]>().mockResolvedValue({
                stdout,
                stderr: "debug stderr body",
                exitCode: 0,
                durationMs: 123,
            }),
            outputParser: vi.fn().mockReturnValue(output),
        });
        const service = createRefreshService(deps);

        try {
            await service.refresh("state-1", { force: true });
            const joined = lines.join("\n");

            expect(joined).toContain("plugin stdout raw");
            expect(joined).toContain("2026-05-24T14:00:00Z");
            expect(joined).toContain("debug stderr body");
            expect(joined).toContain("parsed plugin output raw");
            expect(joined).toContain("runtime ready payload raw");
        } finally {
            if (original_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = original_node_env;
            }
            remove_transport();
        }
    });

    it("does not log raw plugin payloads outside development", async () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "production";
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        const deps = createDeps({
            runner: vi.fn<RefreshServiceDeps["runner"]>().mockResolvedValue({
                stdout: JSON.stringify({
                    success: true,
                    schemaVersion: 1,
                    updatedAt: "2026-05-24T12:00:00Z",
                    items: [],
                }),
                stderr: "debug stderr body",
                exitCode: 0,
                durationMs: 123,
            }),
        });
        const service = createRefreshService(deps);

        try {
            await service.refresh("state-1", { force: true });
            const joined = lines.join("\n");

            expect(joined).toContain("Plugin state-1 (test-plugin) stdout");
            expect(joined).not.toContain("plugin stdout raw");
            expect(joined).not.toContain("debug stderr body");
            expect(joined).not.toContain("parsed plugin output raw");
            expect(joined).not.toContain("runtime ready payload raw");
        } finally {
            if (original_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = original_node_env;
            }
            remove_transport();
        }
    });

    it("logs refresh boundaries without leaking secret values", async () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message) {
                if (module === "refresh-service") {
                    lines.push(`${level}:${message}`);
                }
            },
        });
        setLogLevel("debug");

        const secretKeys = new Map<string, ReadonlySet<string>>([
            ["state-1", new Set(["API_KEY"])],
        ]);
        const deps = createDeps({
            secretParamKeys: secretKeys,
        });
        (deps.secretsStore.get as ReturnType<typeof vi.fn>).mockResolvedValue("real-secret");
        const service = createRefreshService(deps);

        try {
            await service.refresh("state-1", { force: true });

            const output = lines.join("\n");
            expect(output).toContain("Refresh start: state-1 (force=true)");
            expect(output).toContain("Config loaded for state-1: 1 plugins");
            expect(output).toContain("Secret merge for state-1: found=API_KEY missing=none");
            expect(output).toContain("Parsing plugin output for state-1");
            expect(output).toContain("Saving cache for state-1");
            expect(output).toContain("Runtime state ready for state-1");
            expect(output).not.toContain("real-secret");
        } finally {
            remove_transport();
        }
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

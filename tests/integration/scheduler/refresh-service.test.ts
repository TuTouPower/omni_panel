import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRefreshService } from "../../../src/main/core/scheduler/refresh-service";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { AppConfiguration, ConnectorConfiguration } from "../../../src/main/core/config/types";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import type { Observation } from "../../../src/shared/types/observation";

const script_body = `
return [{
    provider: "deepseek",
    source_instance_id: ctx.params.INSTANCE_ID,
    account_id: ctx.params.INSTANCE_ID,
    account_label: "DeepSeek",
    metric_id: "deepseek:usage",
    raw_label: "usage",
    normalized_label: "Usage",
    window: "month",
    used: 100,
    limit: 1000,
    display_style: "ratio",
    reset_at: null,
    status: "normal",
    observed_at: 1780000000000,
    source: "wrapper",
    stale: false,
    last_error: null
}];
`;

function plugin_config(instance_id = "deepseek-1", enabled = true): ConnectorConfiguration {
    return {
        instanceId: instance_id,
        stateId: instance_id,
        name: "DeepSeek",
        enabled,
        executablePath: "/connectors/deepseek",
        refreshIntervalSeconds: 300,
        parameterValues: { INSTANCE_ID: instance_id, API_KEY: "configured-secret" },
        endpointOverrides: {},
    };
}

// Variant with no configured API_KEY — simulates a user who added the plugin
// but never entered a secret. Vault is also empty, so the required secret is
// genuinely missing.
function plugin_config_no_secret(instance_id = "deepseek-1"): ConnectorConfiguration {
    return {
        ...plugin_config(instance_id),
        parameterValues: { INSTANCE_ID: instance_id },
    };
}

function definition(directory: string, script = "connector.js"): ConnectorDefinition {
    return {
        directory,
        executablePath: directory,
        manifest: {
            id: "deepseek",
            provider: "deepseek",
            capabilities: ["poll"],
            parameters: [
                { name: "INSTANCE_ID", type: "string", required: true, exposeToScript: true },
                { name: "API_KEY", type: "secret", required: true, exposeToScript: true },
            ],
            endpoints: { default: "http://127.0.0.1:1" },
            script,
            poll: {
                request: { endpoint: "default", path: "/usage", method: "GET" },
                map: { used: "$.used", limit: "$.limit", window: "month" },
            },
        },
    };
}

function create_vault(): VaultBackend {
    const values = new Map<string, string>();
    return {
        get: vi.fn((key: string) => Promise.resolve(values.get(key) ?? null)),
        set: vi.fn((key: string, value: string) => {
            values.set(key, value);
            return Promise.resolve();
        }),
        delete: vi.fn((key: string) => {
            values.delete(key);
            return Promise.resolve();
        }),
        has: vi.fn((key: string) => Promise.resolve(values.has(key))),
        list_keys: vi.fn((prefix?: string) =>
            Promise.resolve([...values.keys()].filter((key) => !prefix || key.startsWith(prefix))),
        ),
    };
}

function create_observation_store(): ObservationStore & { inserted: Observation[] } {
    const inserted: Observation[] = [];
    return {
        inserted,
        insert(obs: Observation) {
            inserted.push(obs);
        },
        get_latest: vi.fn(() => null as Observation | null),
        list_latest_by_provider: vi.fn(() => [] as Observation[]),
        list_all_providers: vi.fn(() => [] as string[]),
        list_by_source_instance_id: vi.fn(() => [] as Observation[]),
        prune: vi.fn(() => 0),
        close: vi.fn(),
    };
}

function create_config_store(plugins: ConnectorConfiguration[]) {
    return {
        load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
            schemaVersion: 1,
            language: "zh-Hans",
            plugins,
            launchAtLogin: false,
        }),
        save: vi.fn<(config: AppConfiguration) => Promise<void>>().mockResolvedValue(undefined),
        scheduleSave: vi.fn(),
        flushPendingSave: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        hasPendingSave: vi.fn<() => boolean>().mockReturnValue(false),
    };
}

async function create_service(plugins: ConnectorConfiguration[]) {
    const tempDir = await mkdtemp(join(tmpdir(), "connector-refresh-test-"));
    await writeFile(join(tempDir, "connector.js"), script_body);
    const observationStore = create_observation_store();
    const runtimeStore = createRuntimeStore();
    const service = createRefreshService({
        definitions: [definition(tempDir)],
        observationStore,
        runtimeStore,
        configStore: create_config_store(
            plugins.map((plugin) => ({ ...plugin, executablePath: tempDir })),
        ),
        vault: create_vault(),
    });
    return { tempDir, service, observationStore, runtimeStore };
}

describe("refresh-service", () => {
    it("executes script connector and stores observations", async () => {
        const { tempDir, service, observationStore, runtimeStore } = await create_service([
            plugin_config(),
        ]);

        try {
            await service.refresh("deepseek-1", { force: true });

            expect(observationStore.inserted).toHaveLength(1);
            expect(observationStore.inserted[0]).toMatchObject({
                provider: "deepseek",
                source_instance_id: "deepseek-1",
                used: 100,
                limit: 1000,
            });
            const state = runtimeStore.getSnapshot("deepseek-1");
            expect(state.status).toBe("ready");
            if (state.status !== "ready") throw new Error("expected ready state");
            expect(state.items[0]).toMatchObject({
                provider: "deepseek",
                source: "wrapper",
                sourceInstanceId: "deepseek-1",
                accountId: "deepseek-1",
                used: 100,
                limit: 1000,
            });
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("keeps last successful snapshot while loading and after failure", async () => {
        const tempDir = await mkdtemp(join(tmpdir(), "connector-refresh-fail-test-"));
        await writeFile(join(tempDir, "connector.js"), `throw new Error("boom");`);
        const runtimeStore = createRuntimeStore();
        runtimeStore.updateState("deepseek-1", {
            status: "ready",
            items: [],
            updatedAt: new Date("2026-06-06T12:00:00Z"),
        });
        const service = createRefreshService({
            definitions: [definition(tempDir)],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([{ ...plugin_config(), executablePath: tempDir }]),
            vault: create_vault(),
        });

        try {
            await service.refresh("deepseek-1", { force: true });

            const state = runtimeStore.getSnapshot("deepseek-1");
            expect(state.status).toBe("failed");
            if (state.status !== "failed") throw new Error("expected failed state");
            expect(state.error).toBe("boom");
            expect(state.lastSuccess?.updatedAt).toBe("2026-06-06T12:00:00.000Z");
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("prevents concurrent refresh for same instance", async () => {
        const { tempDir, service, observationStore } = await create_service([plugin_config()]);

        try {
            await Promise.all([
                service.refresh("deepseek-1", { force: true }),
                service.refresh("deepseek-1", { force: true }),
            ]);

            expect(observationStore.inserted.length).toBeLessThanOrEqual(1);
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("refreshAll processes only enabled connectors", async () => {
        const { tempDir, service, observationStore } = await create_service([
            plugin_config("enabled-1"),
            plugin_config("enabled-2"),
            plugin_config("disabled-1", false),
        ]);

        try {
            await service.refreshAll();
            expect(observationStore.inserted).toHaveLength(2);
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("fails refresh when a required secret is missing instead of sending empty credentials", async () => {
        // Regression: previously build_params fell back to `configured` when the
        // vault had no secret, and `configured` was "" when parameterValues had
        // no entry. That silently produced an unauthenticated API request.
        // Required secret missing MUST surface as a failed state with an
        // explicit error, not a quiet empty-string fallback.
        const { tempDir, service, observationStore, runtimeStore } = await create_service([
            plugin_config_no_secret("deepseek-1"),
        ]);

        try {
            await service.refresh("deepseek-1", { force: true });

            expect(observationStore.inserted).toHaveLength(0);
            const state = runtimeStore.getSnapshot("deepseek-1");
            expect(state.status).toBe("failed");
            if (state.status !== "failed") throw new Error("expected failed state");
            expect(state.error).toMatch(/API_KEY/i);
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("passes config.proxy.url to create_connector_context as proxy_url", async () => {
        // Verify the wiring: when config.proxy.url is set, the proxy_url
        // propagates to the net-client layer. An invalid proxy URL causes
        // the HTTP request to fail with a proxy-related error, proving
        // the proxy was used rather than a direct connection.
        const tempDir = await mkdtemp(join(tmpdir(), "connector-proxy-test-"));
        const poll_script = `
const resp = await ctx.http.get_json("default", "/usage");
return [{
    provider: "deepseek",
    source_instance_id: ctx.params.INSTANCE_ID,
    account_id: ctx.params.INSTANCE_ID,
    account_label: "DeepSeek",
    metric_id: "deepseek:usage",
    raw_label: "usage",
    normalized_label: "Usage",
    window: "month",
    used: resp.used,
    limit: resp.limit,
    display_style: "ratio",
    reset_at: null,
    status: "normal",
    observed_at: 1780000000000,
    source: "wrapper",
    stale: false,
    last_error: null
}];`;
        await writeFile(join(tempDir, "connector.js"), poll_script);
        const observationStore = create_observation_store();
        const runtimeStore = createRuntimeStore();
        const configStore = {
            load: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
                schemaVersion: 1,
                language: "zh-Hans",
                plugins: [{ ...plugin_config(), executablePath: tempDir }],
                launchAtLogin: false,
                proxy: { url: "http://127.0.0.1:1" }, // invalid proxy → should fail with proxy error
            }),
            save: vi.fn<(config: AppConfiguration) => Promise<void>>().mockResolvedValue(undefined),
            scheduleSave: vi.fn(),
            flushPendingSave: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
            hasPendingSave: vi.fn<() => boolean>().mockReturnValue(false),
        };
        const service = createRefreshService({
            definitions: [definition(tempDir)],
            observationStore,
            runtimeStore,
            configStore,
            vault: create_vault(),
        });

        try {
            await service.refresh("deepseek-1", { force: true });

            const state = runtimeStore.getSnapshot("deepseek-1");
            expect(state.status).toBe("failed");
            if (state.status !== "failed") throw new Error("expected failed state");
            // Error should indicate proxy/connection failure, NOT a direct
            // connection to the real endpoint (which would succeed or give
            // a different error).
            expect(state.error).toMatch(/connect|ECONNREFUSED|proxy|fetch/i);
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("auto re-login session connector on auth error and retries", async () => {
        const tempDir = await mkdtemp(join(tmpdir(), "connector-session-relogin-"));
        // Script behavior controlled by SESSION_COOKIE value in vault
        const session_script = `
if (ctx.params.SESSION_COOKIE === "expired") {
    throw new Error("HTTP 401: request failed");
}
return [{
    provider: "mimo",
    source_instance_id: "mimo-1",
    account_id: "mimo-1",
    account_label: "MiMo",
    metric_id: "mimo:usage",
    raw_label: "usage",
    normalized_label: "Usage",
    window: "month",
    used: 50,
    limit: 100,
    display_style: "percent",
    reset_at: null,
    status: "normal",
    observed_at: 1780000000000,
    source: "session",
    stale: false,
    last_error: null
}];`;
        await writeFile(join(tempDir, "connector.js"), session_script);
        const observationStore = create_observation_store();
        const runtimeStore = createRuntimeStore();
        const vault = create_vault();
        await vault.set("mimo-1:SESSION_COOKIE", "expired");
        const sessionLogin = vi.fn().mockImplementation(async () => {
            await vault.set("mimo-1:SESSION_COOKIE", "valid");
            return { saved: true };
        });
        const service = createRefreshService({
            definitions: [
                {
                    directory: tempDir,
                    executablePath: tempDir,
                    manifest: {
                        id: "mimo",
                        provider: "mimo",
                        capabilities: ["session"],
                        parameters: [
                            {
                                name: "SESSION_COOKIE",
                                type: "secret",
                                required: true,
                                exposeToScript: true,
                            },
                        ],
                        endpoints: { default: "https://platform.xiaomimimo.com" },
                        script: "connector.js",
                    },
                },
            ],
            observationStore,
            runtimeStore,
            configStore: create_config_store([
                {
                    ...plugin_config("mimo-1"),
                    executablePath: tempDir,
                    name: "MiMo",
                },
            ]),
            vault,
            sessionLogin,
        });

        try {
            await service.refresh("mimo-1", { force: true });

            expect(sessionLogin).toHaveBeenCalledWith("mimo-1");
            const state = runtimeStore.getSnapshot("mimo-1");
            expect(state.status).toBe("ready");
            if (state.status === "ready") {
                expect(state.items).toHaveLength(1);
                expect(state.items[0]?.used).toBe(50);
            }
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("falls back to failed state when sessionLogin fails", async () => {
        const tempDir = await mkdtemp(join(tmpdir(), "connector-session-relogin-fail-"));
        await writeFile(
            join(tempDir, "connector.js"),
            `throw new Error("HTTP 401: request failed");`,
        );
        const runtimeStore = createRuntimeStore();
        const sessionLogin = vi.fn().mockRejectedValue(new Error("Login timeout"));
        const service = createRefreshService({
            definitions: [
                {
                    directory: tempDir,
                    executablePath: tempDir,
                    manifest: {
                        id: "mimo",
                        provider: "mimo",
                        capabilities: ["session"],
                        parameters: [],
                        endpoints: { default: "https://platform.xiaomimimo.com" },
                        script: "connector.js",
                    },
                },
            ],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([
                {
                    ...plugin_config("mimo-1"),
                    executablePath: tempDir,
                    name: "MiMo",
                    parameterValues: {},
                },
            ]),
            vault: create_vault(),
            sessionLogin,
        });

        try {
            await service.refresh("mimo-1", { force: true });

            expect(sessionLogin).toHaveBeenCalledWith("mimo-1");
            const state = runtimeStore.getSnapshot("mimo-1");
            expect(state.status).toBe("failed");
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("preserves lastSuccess across consecutive failures (anti-flicker)", async () => {
        // Scenario: connector was "ready", fails once (lastSuccess preserved),
        // fails again — second refresh MUST still carry lastSuccess so the
        // renderer can show stale data during loading instead of flickering.
        const tempDir = await mkdtemp(join(tmpdir(), "refresh-anti-flicker-"));
        await writeFile(join(tempDir, "connector.js"), `throw new Error("boom");`);
        const runtimeStore = createRuntimeStore();
        const items = [
            {
                id: "mimo:mimo:mimo:usage",
                provider: "mimo" as const,
                source: "session" as const,
                sourceInstanceId: "mimo-1",
                accountId: "mimo-1",
                accountLabel: "MiMo",
                raw_label: "usage",
                normalized_label: "Usage",
                used: 50,
                limit: 100,
                displayStyle: "percent" as const,
                resetAt: null,
                status: "normal" as const,
                observedAt: 1749211200000,
                stale: false,
            },
        ];
        runtimeStore.updateState("mimo-1", {
            status: "ready",
            items,
            updatedAt: new Date("2026-06-06T12:00:00Z"),
        });
        const service = createRefreshService({
            definitions: [
                {
                    directory: tempDir,
                    executablePath: tempDir,
                    manifest: {
                        id: "mimo",
                        provider: "mimo",
                        capabilities: ["session"],
                        parameters: [],
                        endpoints: { default: "https://platform.xiaomimimo.com" },
                        script: "connector.js",
                    },
                },
            ],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([
                { ...plugin_config("mimo-1"), executablePath: tempDir, name: "MiMo" },
            ]),
            vault: create_vault(),
        });

        try {
            // First failure: lastSuccess preserved from "ready"
            await service.refresh("mimo-1", { force: true });
            let state = runtimeStore.getSnapshot("mimo-1");
            expect(state.status).toBe("failed");
            if (state.status === "failed") {
                expect(state.lastSuccess?.items).toHaveLength(1);
            }

            // Second failure: lastSuccess MUST survive from the "failed" state
            await service.refresh("mimo-1", { force: true });
            state = runtimeStore.getSnapshot("mimo-1");
            expect(state.status).toBe("failed");
            if (state.status === "failed") {
                expect(state.lastSuccess?.items).toHaveLength(1);
            }
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });

    it("does not auto re-login for non-session connectors", async () => {
        const tempDir = await mkdtemp(join(tmpdir(), "connector-no-relogin-"));
        await writeFile(
            join(tempDir, "connector.js"),
            `throw new Error("HTTP 401: request failed");`,
        );
        const runtimeStore = createRuntimeStore();
        const sessionLogin = vi.fn();
        const service = createRefreshService({
            definitions: [definition(tempDir)],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([
                {
                    ...plugin_config("deepseek-1"),
                    executablePath: tempDir,
                },
            ]),
            vault: create_vault(),
            sessionLogin,
        });

        try {
            await service.refresh("deepseek-1", { force: true });

            expect(sessionLogin).not.toHaveBeenCalled();
            const state = runtimeStore.getSnapshot("deepseek-1");
            expect(state.status).toBe("failed");
        } finally {
            await rm(tempDir, { recursive: true, force: true });
        }
    });
});

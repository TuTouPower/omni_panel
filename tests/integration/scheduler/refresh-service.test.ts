import { describe, it, expect, vi } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createRefreshService } from "../../../src/main/core/scheduler/refresh-service";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { AppConfiguration, PluginConfiguration } from "../../../src/main/core/config/types";
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
    name: "Usage",
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

function plugin_config(instance_id = "deepseek-1", enabled = true): PluginConfiguration {
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
function plugin_config_no_secret(instance_id = "deepseek-1"): PluginConfiguration {
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
        get_latest: vi.fn(() => null),
        list_latest_by_provider: vi.fn(() => []),
        list_all_providers: vi.fn(() => []),
        prune: vi.fn(() => 0),
        close: vi.fn(),
    };
}

function create_config_store(plugins: PluginConfiguration[]) {
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

async function create_service(plugins: PluginConfiguration[]) {
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
                source: "api_key",
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
});

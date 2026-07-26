import { describe, it, expect, vi } from "vitest";
import { createRefreshService } from "../../../src/main/core/scheduler/refresh-service";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { AppConfiguration, ConnectorConfiguration } from "../../../src/main/core/config/types";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";

function plugin_config(instance_id = "deepseek-1"): ConnectorConfiguration {
    return {
        instanceId: instance_id,
        stateId: instance_id,
        name: "DeepSeek",
        enabled: true,
        executablePath: "/connectors/deepseek",
        refreshIntervalSeconds: 300,
        parameterValues: { INSTANCE_ID: instance_id, API_KEY: "configured-secret" },
        endpointOverrides: {},
    };
}

function definition(): ConnectorDefinition {
    return {
        directory: "/connectors/deepseek",
        executablePath: "/connectors/deepseek",
        manifest: {
            id: "deepseek",
            provider: "deepseek",
            capabilities: ["poll"],
            parameters: [
                { name: "INSTANCE_ID", type: "string", required: true, exposeToScript: true },
                { name: "API_KEY", type: "secret", required: true, exposeToScript: true },
            ],
            endpoints: { default: "http://127.0.0.1:1" },
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

function create_observation_store(): ObservationStore {
    return {
        insert: vi.fn(),
        get_latest: vi.fn(() => null),
        list_latest_by_provider: vi.fn(() => []),
        list_all_providers: vi.fn(() => []),
        list_by_source_instance_id: vi.fn(() => []),
        query_trend_series: vi.fn(() => []),
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

describe("refresh-service auth-error no-retry (t155)", () => {
    it("calls execute_connector only once on auth error", async () => {
        const execute_connector = vi.fn().mockRejectedValue(new Error("HTTP 401: request failed"));
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
        });

        await service.refresh("deepseek-1", { force: true });

        expect(execute_connector).toHaveBeenCalledTimes(1);
        expect(runtimeStore.getSnapshot("deepseek-1").status).toBe("failed");
    });

    it("retries execute_connector 3 times on non-auth errors", async () => {
        const execute_connector = vi.fn().mockRejectedValue(new Error("boom"));
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
        });

        await service.refresh("deepseek-1", { force: true });

        expect(execute_connector).toHaveBeenCalledTimes(3);
        expect(runtimeStore.getSnapshot("deepseek-1").status).toBe("failed");
    });

    it("retries execute_connector 3 times on 5xx errors", async () => {
        const execute_connector = vi.fn().mockRejectedValue(new Error("HTTP 500 internal"));
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
        });

        await service.refresh("deepseek-1", { force: true });

        expect(execute_connector).toHaveBeenCalledTimes(3);
        expect(runtimeStore.getSnapshot("deepseek-1").status).toBe("failed");
    });

    it("retries execute_connector 3 times on connection errors", async () => {
        const execute_connector = vi
            .fn()
            .mockRejectedValue(new Error("request failed: ECONNRESET"));
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
        });

        await service.refresh("deepseek-1", { force: true });

        expect(execute_connector).toHaveBeenCalledTimes(3);
        expect(runtimeStore.getSnapshot("deepseek-1").status).toBe("failed");
    });
});

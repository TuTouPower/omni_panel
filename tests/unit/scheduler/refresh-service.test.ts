import { describe, it, expect, vi } from "vitest";
import { createRefreshService } from "../../../src/main/core/scheduler/refresh-service";
import { createRuntimeStore } from "../../../src/main/core/scheduler/runtime-store";
import type { AppConfiguration, ConnectorConfiguration } from "../../../src/main/core/config/types";
import type { ConnectorDefinition } from "../../../src/main/core/connector/manifest-loader";
import type { VaultBackend } from "../../../src/main/core/vault/vault-backend";
import type { ObservationStore } from "../../../src/main/core/observation/observation-store";
import type { Observation } from "../../../src/shared/types/observation";

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

function create_observation_store(): ObservationStore & { inserted: Observation[] } {
    const inserted: Observation[] = [];
    return {
        inserted,
        insert: vi.fn((obs: Observation) => {
            inserted.push(obs);
        }),
        get_latest: vi.fn(() => null),
        list_latest_by_provider: vi.fn(() => []),
        list_all_providers: vi.fn(() => []),
        list_by_source_instance_id: vi.fn(() => []),
        query_trend_series: vi.fn(() => []),
        prune: vi.fn(() => 0),
        count_observations: vi.fn(() => 0),
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
        prune_unhealthy_plugins: vi.fn<() => Promise<AppConfiguration>>().mockResolvedValue({
            schemaVersion: 1,
            language: "zh-Hans",
            plugins,
            launchAtLogin: false,
        }),
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

function oauth_definition(): ConnectorDefinition {
    return {
        directory: "/connectors/grok",
        executablePath: "/connectors/grok",
        manifest: {
            id: "grok",
            provider: "grok",
            capabilities: ["poll"],
            parameters: [
                { name: "OAUTH_TOKEN", type: "secret", required: true, exposeToScript: true },
            ],
            endpoints: { grok_billing: "http://127.0.0.1:1" },
            poll: {
                request: {
                    endpoint: "grok_billing",
                    path: "/v1/billing?format=credits",
                    method: "GET",
                    auth: { type: "bearer", secret: "OAUTH_TOKEN" },
                },
                map: { used: "$.used", limit: "$.limit", window: "week" },
            },
            auth: { method: "oauth_device", secret_name: "OAUTH_TOKEN" },
        },
    };
}

function oauth_config(instance_id = "grok-1"): ConnectorConfiguration {
    return {
        instanceId: instance_id,
        stateId: instance_id,
        name: "Grok",
        enabled: true,
        executablePath: "/connectors/grok",
        refreshIntervalSeconds: 300,
        parameterValues: {},
        endpointOverrides: {},
    };
}

const auth_failed_result = {
    observations: [],
    failed_accounts: [
        {
            provider: "grok",
            account_id: "grok",
            account_label: "Grok",
            error: "HTTP 401: request failed (37 bytes)",
        },
    ],
};

const success_observation: Observation = {
    provider: "grok",
    source_instance_id: "grok-1",
    account_id: "grok",
    account_label: "Grok",
    metric_id: "grok:credits",
    raw_label: "credits",
    normalized_label: "额度",
    window: "week",
    used: 42,
    limit: 100,
    display_style: "percent",
    reset_at: null,
    status: "normal",
    observed_at: 1780000000000,
    source: "poll",
    stale: false,
    last_error: null,
};

describe("refresh-service oauth immediate refresh (t172)", () => {
    it("refreshes OAuth token and re-collects after a 401 failed_account (AC2)", async () => {
        const execute_connector = vi
            .fn()
            .mockResolvedValueOnce(auth_failed_result)
            .mockResolvedValueOnce({ observations: [success_observation], failed_accounts: [] });
        const oauth_refresh = vi.fn().mockResolvedValue({ success: true });
        const observationStore = create_observation_store();
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [oauth_definition()],
            observationStore,
            runtimeStore,
            configStore: create_config_store([oauth_config()]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh,
        });

        await service.refresh("grok-1", { force: true });

        expect(oauth_refresh).toHaveBeenCalledTimes(1);
        expect(oauth_refresh).toHaveBeenCalledWith("grok-1", expect.anything());
        expect(execute_connector).toHaveBeenCalledTimes(2);
        const state = runtimeStore.getSnapshot("grok-1");
        expect(state.status).toBe("ready");
        if (state.status === "ready") {
            expect(state.items).toHaveLength(1);
            expect(state.items[0]).toMatchObject({ used: 42, stale: false });
        }
    });

    it("falls back to failed state when refresh fails and no history exists (AC3)", async () => {
        const execute_connector = vi.fn().mockResolvedValue(auth_failed_result);
        const oauth_refresh = vi.fn().mockResolvedValue({ success: false, error: "invalid_grant" });
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [oauth_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([oauth_config()]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh,
        });

        await service.refresh("grok-1", { force: true });

        expect(oauth_refresh).toHaveBeenCalledTimes(1);
        expect(execute_connector).toHaveBeenCalledTimes(1);
        const state = runtimeStore.getSnapshot("grok-1");
        expect(state.status).toBe("failed");
    });

    it("marks prior observations stale preserving the original data time (t174)", async () => {
        // t174: 旧语义（stale 副本 observed_at 打尝试时间）会让卡片相对时间
        // 每轮失败刷新成"几分钟前"。新语义：副本保留原观测 observed_at，
        // UI 相对时间反映数据真实年龄。旧断言整体删除并改写为正确语义。
        const execute_connector = vi.fn().mockResolvedValue(auth_failed_result);
        const oauth_refresh = vi.fn().mockResolvedValue({ success: false, error: "invalid_grant" });
        const prior_obs: Observation = {
            ...success_observation,
            observed_at: 1770000000000,
            stale: false,
            last_error: null,
        };
        const observationStore = create_observation_store();
        observationStore.list_by_source_instance_id = vi.fn(() => [prior_obs]);
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [oauth_definition()],
            observationStore,
            runtimeStore,
            configStore: create_config_store([oauth_config()]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh,
        });

        await service.refresh("grok-1", { force: true });

        expect(oauth_refresh).toHaveBeenCalledTimes(1);
        expect(execute_connector).toHaveBeenCalledTimes(1);
        // 刷新失败退化为现有路径：历史观测被复制为 stale 副本，带 401 文案
        const stale = observationStore.inserted.filter((o) => o.stale);
        expect(stale).toHaveLength(1);
        expect(stale[0]).toMatchObject({
            account_id: "grok",
            used: 42,
            last_error: "HTTP 401: request failed (37 bytes)",
        });
        // stale 副本保留原数据时间，不再覆盖为尝试时间
        expect(stale[0]?.observed_at).toBe(prior_obs.observed_at);
    });

    it("marks per-account failures stale preserving data time on mixed results (t174)", async () => {
        // 脚本成功返回但单账号失败：failed_accounts 分支复制的 stale 副本
        // 同样保留原观测时间（部分失败下 connector 级 updatedAt 会被成功
        // 账号拉高，账号行必须回退到 per-账号 observedAt）。
        const execute_connector = vi.fn().mockResolvedValue({
            observations: [{ ...success_observation, observed_at: 1780000000000 }],
            failed_accounts: [
                {
                    provider: "grok",
                    account_id: "grok",
                    account_label: "Grok",
                    error: "HTTP 500",
                },
            ],
        });
        const prior_obs: Observation = {
            ...success_observation,
            observed_at: 1770000000000,
            stale: false,
            last_error: null,
        };
        const observationStore = create_observation_store();
        observationStore.list_by_source_instance_id = vi.fn(() => [prior_obs]);
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [oauth_definition()],
            observationStore,
            runtimeStore,
            configStore: create_config_store([oauth_config()]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh: vi.fn(),
        });

        await service.refresh("grok-1", { force: true });

        const stale = observationStore.inserted.filter((o) => o.stale);
        expect(stale).toHaveLength(1);
        expect(stale[0]?.account_id).toBe("grok");
        expect(stale[0]?.observed_at).toBe(prior_obs.observed_at);
    });

    it("attempts immediate refresh at most once per refresh cycle (AC3)", async () => {
        // 刷新成功但重试仍 401：第二轮不得再次调用 oauth_refresh
        const execute_connector = vi.fn().mockResolvedValue(auth_failed_result);
        const oauth_refresh = vi.fn().mockResolvedValue({ success: true });
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [oauth_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([oauth_config()]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh,
        });

        await service.refresh("grok-1", { force: true });

        expect(oauth_refresh).toHaveBeenCalledTimes(1);
        expect(execute_connector).toHaveBeenCalledTimes(2);
        const state = runtimeStore.getSnapshot("grok-1");
        expect(state.status).toBe("failed");
    });

    it("still retries when OAuth refresh succeeds on the last attempt (AC2 boundary)", async () => {
        // 前两次为连接错误重试，第三次 401 且刷新成功：必须多给一次重试机会
        const execute_connector = vi
            .fn()
            .mockRejectedValueOnce(new Error("request failed: ETIMEDOUT"))
            .mockRejectedValueOnce(new Error("request failed: ETIMEDOUT"))
            .mockRejectedValueOnce(new Error("HTTP 401: request failed"))
            .mockResolvedValueOnce({ observations: [success_observation], failed_accounts: [] });
        const oauth_refresh = vi.fn().mockResolvedValue({ success: true });
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [oauth_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([oauth_config()]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh,
        });

        await service.refresh("grok-1", { force: true });

        expect(oauth_refresh).toHaveBeenCalledTimes(1);
        expect(execute_connector).toHaveBeenCalledTimes(4);
        const state = runtimeStore.getSnapshot("grok-1");
        expect(state.status).toBe("ready");
        if (state.status === "ready") {
            expect(state.items[0]).toMatchObject({ used: 42, stale: false });
        }
    });

    it("refreshes OAuth token on throw-path 401 and re-collects (tier-1 poll)", async () => {
        // 非 script 的 tier-1 poll 401 会 throw 到 refresh-service，须同走即时刷新兜底
        const execute_connector = vi
            .fn()
            .mockRejectedValueOnce(new Error("HTTP 401: request failed"))
            .mockResolvedValueOnce({ observations: [success_observation], failed_accounts: [] });
        const oauth_refresh = vi.fn().mockResolvedValue({ success: true });
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [oauth_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([oauth_config()]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh,
        });

        await service.refresh("grok-1", { force: true });

        expect(oauth_refresh).toHaveBeenCalledTimes(1);
        expect(execute_connector).toHaveBeenCalledTimes(2);
        const state = runtimeStore.getSnapshot("grok-1");
        expect(state.status).toBe("ready");
    });

    it("does not trigger oauth refresh for non-oauth (apikey) connector auth errors (t155 regression)", async () => {
        const execute_connector = vi.fn().mockRejectedValue(new Error("HTTP 401: request failed"));
        const oauth_refresh = vi.fn();
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
            oauth_refresh,
        });

        await service.refresh("deepseek-1", { force: true });

        expect(oauth_refresh).not.toHaveBeenCalled();
        expect(execute_connector).toHaveBeenCalledTimes(1);
    });
});

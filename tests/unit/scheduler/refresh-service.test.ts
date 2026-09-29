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
        manifestId: "deepseek",
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
        replaceAll: vi.fn((entries: Record<string, string>) => {
            values.clear();
            for (const [key, value] of Object.entries(entries)) values.set(key, value);
            return Promise.resolve();
        }),
    };
}

function create_observation_store(): ObservationStore & { inserted: Observation[] } {
    const inserted: Observation[] = [];
    return {
        inserted,
        insert: vi.fn((obs: Observation) => {
            inserted.push(obs);
        }),
        insert_batch: vi.fn((obs: Observation[]) => {
            inserted.push(...obs);
            return { ok: obs.length, failed: 0 };
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
        saveIfBaseMatches: vi
            .fn<
                (base: AppConfiguration, config: AppConfiguration) => Promise<"saved" | "conflict">
            >()
            .mockResolvedValue("saved"),
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

describe("refresh-service flowercloud page refresh", () => {
    function flower_definition(): ConnectorDefinition {
        return {
            directory: "/connectors/flowercloud",
            executablePath: "/connectors/flowercloud",
            manifest: {
                id: "flowercloud",
                provider: "flowercloud",
                capabilities: ["session"],
                auth: {
                    method: "web_login",
                    secret_name: "SESSION_COOKIE",
                    login_url: "https://api-flowercloud.com/clientarea.php",
                },
                parameters: [
                    {
                        name: "SESSION_COOKIE",
                        type: "secret",
                        required: true,
                        exposeToScript: true,
                    },
                ],
                endpoints: { default: "https://api-flowercloud.com" },
                script: "connector.ts",
            },
        };
    }

    function flower_config(): ConnectorConfiguration {
        return {
            instanceId: "flower-1",
            stateId: "flower-1",
            manifestId: "flowercloud",
            name: "FlowerCloud",
            enabled: true,
            executablePath: "/connectors/flowercloud",
            refreshIntervalSeconds: 1800,
            parameterValues: {},
            endpointOverrides: {},
        };
    }

    const flower_observation: Observation = {
        provider: "flowercloud",
        source_instance_id: "flower-1",
        account_id: "flowercloud_default",
        account_label: "Global Acceleration Max",
        metric_id: "flowercloud:traffic",
        raw_label: "monthly_traffic",
        normalized_label: "月流量",
        window: "month",
        used: 331,
        limit: 1000,
        display_style: "ratio",
        reset_at: null,
        status: "normal",
        observed_at: 1780000000000,
        source: "session",
        stale: false,
        last_error: null,
    };

    it("rereads the flowercloud page before the connector runs", async () => {
        const order: string[] = [];
        const refresh_web_session = vi.fn(() => {
            order.push("page");
            return Promise.resolve({ ok: true });
        });
        const execute_connector = vi.fn(() => {
            order.push("connector");
            return Promise.resolve({
                observations: [flower_observation],
                failed_accounts: [],
            });
        });
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore: create_observation_store(),
            runtimeStore: createRuntimeStore(),
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector,
            refresh_web_session,
        });

        await service.refresh("flower-1");

        expect(order).toEqual(["page", "connector"]);
        expect(refresh_web_session).toHaveBeenCalledTimes(1);
    });

    it("marks the instance failed with the capture reason instead of replaying the connector", async () => {
        const execute_connector = vi.fn();
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector,
            refresh_web_session: vi.fn().mockResolvedValue({
                ok: false,
                reason: "花云要求完成人机验证（Cloudflare 质询）",
            }),
        });

        await service.refresh("flower-1");

        // 没有新 DOM 时不浪费连接器预算重放旧 HTML，直接如实标记失败原因（AC-003 / AC-004）。
        expect(execute_connector).not.toHaveBeenCalled();
        const state = runtimeStore.getSnapshot("flower-1");
        expect(state.status).toBe("failed");
        if (state.status === "failed") {
            expect(state.error).toContain("人机验证");
        }
    });

    it("keeps the last successful snapshot when the page refresh fails", async () => {
        const runtimeStore = createRuntimeStore();
        const updated_at = new Date("2026-09-29T12:00:00+08:00");
        runtimeStore.updateState("flower-1", {
            status: "ready",
            items: [],
            updatedAt: updated_at,
        });
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector: vi.fn(),
            refresh_web_session: vi.fn().mockResolvedValue({
                ok: false,
                reason: "花云要求完成人机验证（Cloudflare 质询）",
            }),
        });

        await service.refresh("flower-1");

        const state = runtimeStore.getSnapshot("flower-1");
        expect(state.status).toBe("failed");
        if (state.status === "failed") {
            // 失败保留上次成功数据及其采集时间（AC-004）。
            expect(state.lastSuccess?.updatedAt).toBe(updated_at.toISOString());
        }
    });

    it("treats a thrown page-refresh error as a capture failure", async () => {
        const execute_connector = vi.fn();
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector,
            refresh_web_session: vi.fn().mockRejectedValue(new Error("window failed")),
        });

        await service.refresh("flower-1");

        expect(execute_connector).not.toHaveBeenCalled();
        const state = runtimeStore.getSnapshot("flower-1");
        expect(state.status).toBe("failed");
        if (state.status === "failed") {
            expect(state.error).toContain("window failed");
        }
    });

    it("marks the previous observations stale when the capture fails", async () => {
        const runtimeStore = createRuntimeStore();
        const observationStore = create_observation_store();
        observationStore.list_latest_success_by_instance = vi.fn(() => [
            { ...flower_observation, stale: false },
        ]);
        const reason = "花云要求完成人机验证（Cloudflare 质询），本轮未取到新数据";
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore,
            runtimeStore,
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector: vi.fn(),
            refresh_web_session: vi.fn().mockResolvedValue({ ok: false, reason }),
        });

        await service.refresh("flower-1");

        // AC-004：失败必须把上次成功观测降级成 stale + last_error，否则 UI 的
        // 「数据过期」标记与按 stale 判断新鲜度的消费方都会把旧值当新鲜数据。
        expect(observationStore.inserted).toHaveLength(1);
        expect(observationStore.inserted[0]?.stale).toBe(true);
        expect(observationStore.inserted[0]?.last_error).toBe(reason);
    });

    it("marks a forced refresh failed as well when the capture reports a blocked page", async () => {
        const runtimeStore = createRuntimeStore();
        const refresh_web_session = vi
            .fn()
            .mockResolvedValue({ ok: false, reason: "花云访问被拦截，当前网络出口可能受限" });
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector: vi.fn(),
            refresh_web_session,
        });

        await service.refresh("flower-1", { force: true });

        // 手动刷新与定时刷新走同一条失败语义：不前台化、不重放旧 HTML（AC-002 / AC-003）。
        expect(refresh_web_session).toHaveBeenCalledWith("flower-1", expect.anything(), {
            force: true,
        });
        const state = runtimeStore.getSnapshot("flower-1");
        expect(state.status).toBe("failed");
        if (state.status === "failed") {
            expect(state.error).toContain("网络出口");
        }
    });

    it("does not open a page for connectors that are not flowercloud", async () => {
        const refresh_web_session = vi.fn().mockResolvedValue({ ok: true });
        const execute_connector = vi.fn().mockResolvedValue({
            observations: [
                {
                    ...flower_observation,
                    provider: "deepseek",
                    metric_id: "deepseek:usage",
                },
            ],
            failed_accounts: [],
        });
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore: createRuntimeStore(),
            configStore: create_config_store([plugin_config()]),
            vault: create_vault(),
            execute_connector,
            refresh_web_session,
        });

        await service.refresh("deepseek-1");

        expect(refresh_web_session).not.toHaveBeenCalled();
        expect(execute_connector).toHaveBeenCalledTimes(1);
    });

    it("marks the instance loading before the page refresh starts", async () => {
        const runtimeStore = createRuntimeStore();
        const observed: string[] = [];
        const refresh_web_session = vi.fn(() => {
            observed.push(runtimeStore.getSnapshot("flower-1").status);
            return Promise.resolve({ ok: true });
        });
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector: vi.fn().mockResolvedValue({
                observations: [flower_observation],
                failed_accounts: [],
            }),
            refresh_web_session,
        });

        await service.refresh("flower-1");

        // 抓取最长可到两分钟以上，这段时间 UI 必须已经显示「刷新中」。
        expect(observed).toEqual(["loading"]);
    });

    it("passes the manual-refresh flag through to the page refresh", async () => {
        const refresh_web_session = vi.fn().mockResolvedValue({ ok: true });
        const service = createRefreshService({
            definitions: [flower_definition()],
            observationStore: create_observation_store(),
            runtimeStore: createRuntimeStore(),
            configStore: create_config_store([flower_config()]),
            vault: create_vault(),
            execute_connector: vi.fn().mockResolvedValue({
                observations: [flower_observation],
                failed_accounts: [],
            }),
            refresh_web_session,
        });

        await service.refresh("flower-1");
        await service.refresh("flower-1", { force: true });

        expect(refresh_web_session).toHaveBeenNthCalledWith(1, "flower-1", expect.anything(), {
            force: false,
        });
        expect(refresh_web_session).toHaveBeenNthCalledWith(2, "flower-1", expect.anything(), {
            force: true,
        });
    });
});

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
        manifestId: "grok",
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

    it("stale insert failure does not block failed state update (t370 AC-002)", async () => {
        // 全轮失败（脚本抛错）后 stale 副本插入抛错——failed 状态更新仍执行，
        // runtime store 不卡在 loading（自动调度路径仅 log 不推状态，故必须无条件置 failed）。
        const execute_connector = vi.fn().mockRejectedValue(new Error("HTTP 500"));
        const runtimeStore = createRuntimeStore();
        const observationStore = create_observation_store();
        // list_by_source 返回 prior 观测 → 走全轮失败 stale 插入段（t370 新增 try/catch）。
        observationStore.list_by_source_instance_id = vi
            .fn<(source: string) => Observation[]>()
            .mockReturnValue([
                {
                    ...success_observation,
                    observed_at: 1770000000000,
                },
            ]);
        const insert_mock = vi.fn(() => {
            throw new Error("stale insert boom");
        });
        observationStore.insert = insert_mock;
        observationStore.insert_batch = insert_mock;
        const service = createRefreshService({
            definitions: [definition()],
            observationStore,
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
        });

        await service.refresh("deepseek-1");
        const state = runtimeStore.getSnapshot("deepseek-1");
        // stale 插入失败被告警，但 failed 状态已更新——不卡 loading。
        expect(state.status).toBe("failed");
        expect(insert_mock).toHaveBeenCalled();
    });

    it("refreshAll surfaces per-instance failed state (t370 AC-003)", async () => {
        const execute_connector = vi
            .fn()
            .mockResolvedValueOnce({ observations: [success_observation], failed_accounts: [] })
            .mockResolvedValueOnce({
                observations: [],
                failed_accounts: [
                    {
                        provider: "grok",
                        account_id: "grok",
                        account_label: "Grok",
                        error: "HTTP 503",
                    },
                ],
            });
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([
                plugin_config("deepseek-1"),
                plugin_config("deepseek-2"),
            ]),
            vault: create_vault(),
            execute_connector,
        });

        await service.refreshAll();

        // 失败实例状态 failed（用户可见），成功实例非 failed。
        expect(runtimeStore.getSnapshot("deepseek-2").status).toBe("failed");
        expect(runtimeStore.getSnapshot("deepseek-1").status).not.toBe("failed");
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

describe("refresh-service per-instance lock short-circuit (t196 AC2)", () => {
    it("does not run a second collection while the first is still in flight", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const execute_connector = vi.fn().mockImplementation(async () => {
            await gate; // hold the first collection in flight
            return { observations: [], failed_accounts: [] };
        });
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
        });

        const first = service.refresh("deepseek-1", { force: true });
        await vi.waitFor(() => {
            expect(execute_connector).toHaveBeenCalledTimes(1);
        });

        // 第二轮（手动 + 定时并发场景）非 force 在锁内被短路，不进入采集。
        await service.refresh("deepseek-1");
        release();
        await first;

        expect(execute_connector).toHaveBeenCalledTimes(1);
    });

    it("force=true bypasses the in-flight lock (t370 AC-001)", async () => {
        let release!: () => void;
        const gate = new Promise<void>((resolve) => {
            release = resolve;
        });
        const execute_connector = vi.fn().mockImplementation(async () => {
            await gate; // hold the first collection in flight
            return { observations: [], failed_accounts: [] };
        });
        const runtimeStore = createRuntimeStore();
        const service = createRefreshService({
            definitions: [definition()],
            observationStore: create_observation_store(),
            runtimeStore,
            configStore: create_config_store([plugin_config("deepseek-1")]),
            vault: create_vault(),
            execute_connector,
        });

        const first = service.refresh("deepseek-1");
        await vi.waitFor(() => {
            expect(execute_connector).toHaveBeenCalledTimes(1);
        });

        // force=true 绕过锁——第二轮也进入采集（用户显式请求优先）。
        const second = service.refresh("deepseek-1", { force: true });
        await vi.waitFor(() => {
            expect(execute_connector).toHaveBeenCalledTimes(2);
        });
        release();
        await Promise.all([first, second]);
    });

    it("releases the lock after a refresh completes so a later refresh runs", async () => {
        const execute_connector = vi
            .fn()
            .mockResolvedValue({ observations: [], failed_accounts: [] });
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

        // 锁已释放：第二次刷新再次执行采集。
        await service.refresh("deepseek-1", { force: true });
        expect(execute_connector).toHaveBeenCalledTimes(2);
    });
});

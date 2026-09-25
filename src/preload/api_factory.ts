import type {
    UsageboardApi,
    RendererPlatform,
    GrokReadonlyApi,
    GrokSettingsApi,
    KimiReadonlyApi,
    KimiSettingsApi,
    GrokBotReadonlyApi,
    GrokBotSettingsApi,
} from "../shared/types/ipc";
import type { AppConfiguration } from "../shared/types/config";
import { filter_popup_config_save } from "./config_filter";
import {
    select_config_api,
    select_session_api,
    select_grok_api,
    select_kimi_api,
    select_grok_bot_api,
    select_trend_api,
    select_session_history_api,
} from "./route_api";

export interface PreloadConfigFactoryDeps {
    readonly config_full: UsageboardApi["config"];
    readonly config_readonly: { get: () => Promise<{ config: AppConfiguration }> };
}

/**
 * 生产配置能力分权工厂 (A95 & A140)。
 * - setting: 完整管理能力
 * - popup (usage): 受白名单保护的持久化能力（自动拉取当前配置，过滤越权键）
 * - tray / session: 纯只读存根（save 为 no-op）
 */
export function create_preload_config(
    route: string,
    deps: PreloadConfigFactoryDeps,
): UsageboardApi["config"] {
    const config_readonly_stubs: UsageboardApi["config"] = {
        get: deps.config_readonly.get as never,
        save: () => Promise.resolve(),
        saveSecrets: () => Promise.resolve(),
        getSecrets: () => Promise.resolve({}),
        duplicate: () => Promise.resolve({ instanceId: "" }),
        createInstance: () => Promise.resolve({ instanceId: "" }),
        export: () => Promise.resolve({ saved: false }),
        import: () => Promise.resolve({ imported: false }),
    };

    const config_popup: UsageboardApi["config"] = {
        ...config_readonly_stubs,
        save: async (config: unknown) => {
            if (!config || typeof config !== "object") return;
            const current = await deps.config_readonly.get();
            const safe_config = filter_popup_config_save(
                config as Record<string, unknown>,
                current.config as unknown as Record<string, unknown>,
            );
            return deps.config_full.save(safe_config as never);
        },
    };

    return select_config_api(route, deps.config_full, config_popup, config_readonly_stubs);
}

export interface PreloadApiFactoryDeps {
    platform: RendererPlatform;
    common_base: Omit<
        UsageboardApi,
        | "platform"
        | "config"
        | "session"
        | "grok"
        | "kimi"
        | "grok_bot"
        | "trend"
        | "sessionHistory"
    >;
    config: UsageboardApi["config"];
    session: {
        settings: UsageboardApi["session"];
        disabled: UsageboardApi["session"];
    };
    grok: {
        readonly_api: GrokReadonlyApi;
        settings_api: GrokSettingsApi;
    };
    kimi: {
        readonly_api: KimiReadonlyApi;
        settings_api: KimiSettingsApi;
    };
    grok_bot: {
        readonly_api: GrokBotReadonlyApi;
        settings_api: GrokBotSettingsApi;
    };
    trend: {
        full: UsageboardApi["trend"];
        disabled: UsageboardApi["trend"];
    };
    sessionHistory: {
        full: UsageboardApi["sessionHistory"];
        open_only: UsageboardApi["sessionHistory"];
        disabled: UsageboardApi["sessionHistory"];
    };
}

/**
 * 数据驱动 Preload API 装配工厂 (A95 & A144)。
 * 根据窗口路由 route 组装对应权限档位的 UsageboardApi 实例。
 */
export function create_preload_api(route: string, deps: PreloadApiFactoryDeps): UsageboardApi {
    const route_session_api = select_session_api(
        route,
        deps.session.settings,
        deps.session.disabled,
    );
    const route_grok_api = select_grok_api(route, deps.grok.readonly_api, deps.grok.settings_api);
    const route_kimi_api = select_kimi_api(route, deps.kimi.readonly_api, deps.kimi.settings_api);
    const route_grok_bot_api = select_grok_bot_api(
        route,
        deps.grok_bot.readonly_api,
        deps.grok_bot.settings_api,
    );
    const route_trend_api = select_trend_api(route, deps.trend.full, deps.trend.disabled);
    const route_session_history_api = select_session_history_api(
        route,
        deps.sessionHistory.full,
        deps.sessionHistory.open_only,
        deps.sessionHistory.disabled,
    );

    return {
        platform: deps.platform,
        ...deps.common_base,
        config: deps.config,
        session: route_session_api,
        grok: route_grok_api,
        kimi: route_kimi_api,
        grok_bot: route_grok_bot_api,
        trend: route_trend_api,
        sessionHistory: route_session_history_api,
    };
}

import { IPC_CHANNELS } from "../shared/types/ipc";
import type {
    GrokDeviceCodeStart,
    GrokLoginResult,
    GrokLoginStatus,
    GrokRefreshResult,
    KimiDeviceCodeStart,
    KimiLoginResult,
    KimiLoginStatus,
    KimiRefreshResult,
    GrokBotLoginStartResult,
    GrokBotLoginPollResult,
    GrokBotRefreshApiResult,
    GrokBotSettingsApi,
} from "../shared/types/ipc";

export interface OAuthApiFactoryDeps {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
}

export interface OAuthApiChannels {
    readonly login_start: string;
    readonly login_poll: string;
    readonly login_cancel: string;
    readonly login_status: string;
    readonly logout: string;
    readonly refresh: string;
}

/** 各 OAuth 通道的返回类型映射（t394 AC-001）。invoke 调用点按此映射带具体类型，
 *  返回结构由 TReturns 派生，per-provider 返回类型编译期可强制（去整体 `as`）。 */
export interface OAuthApiReturnTypes {
    readonly login_start: unknown;
    readonly login_poll: unknown;
    readonly login_cancel: undefined;
    readonly login_status: unknown;
    readonly logout: { logged_out: boolean };
    readonly refresh: unknown;
}

/** 工厂返回结构：由通道返回类型映射派生（t394）。 */
export interface OAuthApis<TReturns extends OAuthApiReturnTypes> {
    readonly readonly_api: {
        login_status(instance_id: string): Promise<TReturns["login_status"]>;
    };
    readonly settings_api: {
        login_start(): Promise<TReturns["login_start"]>;
        login_poll(
            instance_id: string,
            device_code: string,
            interval: number,
            expires_at_epoch_ms: number,
        ): Promise<TReturns["login_poll"]>;
        login_cancel(instance_id: string): Promise<TReturns["login_cancel"]>;
        login_status(instance_id: string): Promise<TReturns["login_status"]>;
        logout(instance_id: string): Promise<TReturns["logout"]>;
        refresh(instance_id: string): Promise<TReturns["refresh"]>;
    };
}

/** 参数化 OAuth preload API 工厂（t339）：差异收敛到 channel 映射。 */
export function create_oauth_apis<TReturns extends OAuthApiReturnTypes>(
    deps: OAuthApiFactoryDeps,
    channels: OAuthApiChannels,
): OAuthApis<TReturns> {
    const login_status = (instance_id: string) =>
        deps.invoke<TReturns["login_status"]>(channels.login_status, instance_id);
    return {
        readonly_api: { login_status },
        settings_api: {
            login_start: () => deps.invoke<TReturns["login_start"]>(channels.login_start),
            login_poll: (
                instance_id: string,
                device_code: string,
                interval: number,
                expires_at_epoch_ms: number,
            ) =>
                deps.invoke<TReturns["login_poll"]>(
                    channels.login_poll,
                    instance_id,
                    device_code,
                    interval,
                    expires_at_epoch_ms,
                ),
            login_cancel: (instance_id: string) =>
                deps.invoke<TReturns["login_cancel"]>(channels.login_cancel, instance_id),
            login_status,
            logout: (instance_id: string) =>
                deps.invoke<TReturns["logout"]>(channels.logout, instance_id),
            refresh: (instance_id: string) =>
                deps.invoke<TReturns["refresh"]>(channels.refresh, instance_id),
        },
    };
}

export interface GrokOAuthReturnTypes extends OAuthApiReturnTypes {
    login_start: GrokDeviceCodeStart;
    login_poll: GrokLoginResult;
    login_cancel: undefined;
    login_status: GrokLoginStatus;
    logout: { logged_out: boolean };
    refresh: GrokRefreshResult;
}

export interface KimiOAuthReturnTypes extends OAuthApiReturnTypes {
    login_start: KimiDeviceCodeStart;
    login_poll: KimiLoginResult;
    login_cancel: undefined;
    login_status: KimiLoginStatus;
    logout: { logged_out: boolean };
    refresh: KimiRefreshResult;
}

export function create_grok_oauth_apis(deps: OAuthApiFactoryDeps): OAuthApis<GrokOAuthReturnTypes> {
    return create_oauth_apis<GrokOAuthReturnTypes>(deps, {
        login_start: IPC_CHANNELS.GROK_LOGIN_START,
        login_poll: IPC_CHANNELS.GROK_LOGIN_POLL,
        login_cancel: IPC_CHANNELS.GROK_LOGIN_CANCEL,
        login_status: IPC_CHANNELS.GROK_LOGIN_STATUS,
        logout: IPC_CHANNELS.GROK_LOGOUT,
        refresh: IPC_CHANNELS.GROK_REFRESH,
    });
}

export function create_kimi_oauth_apis(deps: OAuthApiFactoryDeps): OAuthApis<KimiOAuthReturnTypes> {
    return create_oauth_apis<KimiOAuthReturnTypes>(deps, {
        login_start: IPC_CHANNELS.KIMI_LOGIN_START,
        login_poll: IPC_CHANNELS.KIMI_LOGIN_POLL,
        login_cancel: IPC_CHANNELS.KIMI_LOGIN_CANCEL,
        login_status: IPC_CHANNELS.KIMI_LOGIN_STATUS,
        logout: IPC_CHANNELS.KIMI_LOGOUT,
        refresh: IPC_CHANNELS.KIMI_REFRESH,
    });
}

export function create_grok_bot_oauth_apis(deps: OAuthApiFactoryDeps): GrokBotSettingsApi {
    return {
        login_start: () => deps.invoke<GrokBotLoginStartResult>(IPC_CHANNELS.GROK_BOT_LOGIN_START),
        login_poll: (instance_id, uuid, verifier, timeout_ms) =>
            deps.invoke<GrokBotLoginPollResult>(
                IPC_CHANNELS.GROK_BOT_LOGIN_POLL,
                instance_id,
                uuid,
                verifier,
                timeout_ms,
            ),
        login_cancel: (instance_id) =>
            deps.invoke<undefined>(IPC_CHANNELS.GROK_BOT_LOGIN_CANCEL, instance_id),
        logout: (instance_id) =>
            deps.invoke<{ logged_out: boolean }>(IPC_CHANNELS.GROK_BOT_LOGOUT, instance_id),
        refresh: (instance_id) =>
            deps.invoke<GrokBotRefreshApiResult>(IPC_CHANNELS.GROK_BOT_REFRESH, instance_id),
    };
}

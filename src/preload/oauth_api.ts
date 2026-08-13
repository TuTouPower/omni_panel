import { IPC_CHANNELS } from "../shared/types/ipc";
import type {
    GrokReadonlyApi,
    GrokSettingsApi,
    KimiReadonlyApi,
    KimiSettingsApi,
} from "../shared/types/ipc";

export interface OAuthApiFactoryDeps {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
}

export interface OAuthApis<ReadonlyApi, SettingsApi> {
    readonly readonly_api: ReadonlyApi;
    readonly settings_api: SettingsApi;
}

export interface OAuthApiChannels {
    readonly login_start: string;
    readonly login_poll: string;
    readonly login_cancel: string;
    readonly login_status: string;
    readonly logout: string;
    readonly refresh: string;
}

/** 参数化 OAuth preload API 工厂（t339）：差异收敛到 channel 映射。 */
export function create_oauth_apis<TReadonlyApi, TSettingsApi>(
    deps: OAuthApiFactoryDeps,
    channels: OAuthApiChannels,
): OAuthApis<TReadonlyApi, TSettingsApi> {
    const login_status = (instance_id: string) =>
        deps.invoke<unknown>(channels.login_status, instance_id);
    return {
        readonly_api: { login_status },
        settings_api: {
            login_start: () => deps.invoke<unknown>(channels.login_start),
            login_poll: (
                instance_id: string,
                device_code: string,
                interval: number,
                expires_at_epoch_ms: number,
            ) =>
                deps.invoke<unknown>(
                    channels.login_poll,
                    instance_id,
                    device_code,
                    interval,
                    expires_at_epoch_ms,
                ),
            login_cancel: (instance_id: string) =>
                deps.invoke<undefined>(channels.login_cancel, instance_id),
            login_status,
            logout: (instance_id: string) =>
                deps.invoke<{ logged_out: boolean }>(channels.logout, instance_id),
            refresh: (instance_id: string) => deps.invoke<unknown>(channels.refresh, instance_id),
        },
    } as OAuthApis<TReadonlyApi, TSettingsApi>;
}

export function create_grok_oauth_apis(
    deps: OAuthApiFactoryDeps,
): OAuthApis<GrokReadonlyApi, GrokSettingsApi> {
    return create_oauth_apis<GrokReadonlyApi, GrokSettingsApi>(deps, {
        login_start: IPC_CHANNELS.GROK_LOGIN_START,
        login_poll: IPC_CHANNELS.GROK_LOGIN_POLL,
        login_cancel: IPC_CHANNELS.GROK_LOGIN_CANCEL,
        login_status: IPC_CHANNELS.GROK_LOGIN_STATUS,
        logout: IPC_CHANNELS.GROK_LOGOUT,
        refresh: IPC_CHANNELS.GROK_REFRESH,
    });
}

export function create_kimi_oauth_apis(
    deps: OAuthApiFactoryDeps,
): OAuthApis<KimiReadonlyApi, KimiSettingsApi> {
    return create_oauth_apis<KimiReadonlyApi, KimiSettingsApi>(deps, {
        login_start: IPC_CHANNELS.KIMI_LOGIN_START,
        login_poll: IPC_CHANNELS.KIMI_LOGIN_POLL,
        login_cancel: IPC_CHANNELS.KIMI_LOGIN_CANCEL,
        login_status: IPC_CHANNELS.KIMI_LOGIN_STATUS,
        logout: IPC_CHANNELS.KIMI_LOGOUT,
        refresh: IPC_CHANNELS.KIMI_REFRESH,
    });
}

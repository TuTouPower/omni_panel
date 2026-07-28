import { IPC_CHANNELS } from "../shared/types/ipc";
import type {
    GrokDeviceCodeStart,
    GrokLoginResult,
    GrokLoginStatus,
    GrokReadonlyApi,
    GrokRefreshResult,
    GrokSettingsApi,
    KimiDeviceCodeStart,
    KimiLoginResult,
    KimiLoginStatus,
    KimiReadonlyApi,
    KimiRefreshResult,
    KimiSettingsApi,
} from "../shared/types/ipc";

export interface OAuthApiFactoryDeps {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T>;
}

export interface OAuthApis<ReadonlyApi, SettingsApi> {
    readonly readonly_api: ReadonlyApi;
    readonly settings_api: SettingsApi;
}

export function create_grok_oauth_apis(
    deps: OAuthApiFactoryDeps,
): OAuthApis<GrokReadonlyApi, GrokSettingsApi> {
    const readonly_api: GrokReadonlyApi = {
        login_status: (instance_id: string) =>
            deps.invoke<GrokLoginStatus>(IPC_CHANNELS.GROK_LOGIN_STATUS, instance_id),
    };
    const settings_api: GrokSettingsApi = {
        login_start: () => deps.invoke<GrokDeviceCodeStart>(IPC_CHANNELS.GROK_LOGIN_START),
        login_poll: (
            instance_id: string,
            device_code: string,
            interval: number,
            expires_at_epoch_ms: number,
        ) =>
            deps.invoke<GrokLoginResult>(
                IPC_CHANNELS.GROK_LOGIN_POLL,
                instance_id,
                device_code,
                interval,
                expires_at_epoch_ms,
            ),
        login_cancel: (instance_id: string) =>
            deps.invoke<undefined>(IPC_CHANNELS.GROK_LOGIN_CANCEL, instance_id),
        login_status: (instance_id: string) => readonly_api.login_status(instance_id),
        logout: (instance_id: string) =>
            deps.invoke<{ logged_out: boolean }>(IPC_CHANNELS.GROK_LOGOUT, instance_id),
        refresh: (instance_id: string) =>
            deps.invoke<GrokRefreshResult>(IPC_CHANNELS.GROK_REFRESH, instance_id),
    };
    return { readonly_api, settings_api };
}

export function create_kimi_oauth_apis(
    deps: OAuthApiFactoryDeps,
): OAuthApis<KimiReadonlyApi, KimiSettingsApi> {
    const readonly_api: KimiReadonlyApi = {
        login_status: (instance_id: string) =>
            deps.invoke<KimiLoginStatus>(IPC_CHANNELS.KIMI_LOGIN_STATUS, instance_id),
    };
    const settings_api: KimiSettingsApi = {
        login_start: () => deps.invoke<KimiDeviceCodeStart>(IPC_CHANNELS.KIMI_LOGIN_START),
        login_poll: (
            instance_id: string,
            device_code: string,
            interval: number,
            expires_at_epoch_ms: number,
        ) =>
            deps.invoke<KimiLoginResult>(
                IPC_CHANNELS.KIMI_LOGIN_POLL,
                instance_id,
                device_code,
                interval,
                expires_at_epoch_ms,
            ),
        login_cancel: (instance_id: string) =>
            deps.invoke<undefined>(IPC_CHANNELS.KIMI_LOGIN_CANCEL, instance_id),
        login_status: (instance_id: string) => readonly_api.login_status(instance_id),
        logout: (instance_id: string) =>
            deps.invoke<{ logged_out: boolean }>(IPC_CHANNELS.KIMI_LOGOUT, instance_id),
        refresh: (instance_id: string) =>
            deps.invoke<KimiRefreshResult>(IPC_CHANNELS.KIMI_REFRESH, instance_id),
    };
    return { readonly_api, settings_api };
}

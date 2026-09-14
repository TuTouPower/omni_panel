export interface LoginItemApi {
    getLoginItemSettings(): { openAtLogin: boolean };
    setLoginItemSettings(settings: { openAtLogin: boolean }): void;
}

export interface LaunchAtLoginState {
    readonly available: boolean;
    readonly enabled: boolean;
}

function is_available(api: LoginItemApi | undefined, platform: NodeJS.Platform): boolean {
    return platform !== "linux" && api !== undefined;
}

export function read_launch_at_login(
    api: LoginItemApi | undefined,
    platform: NodeJS.Platform = process.platform,
): LaunchAtLoginState {
    if (api === undefined || !is_available(api, platform)) {
        return { available: false, enabled: false };
    }
    return { available: true, enabled: api.getLoginItemSettings().openAtLogin };
}

export function apply_launch_at_login(
    api: LoginItemApi | undefined,
    enabled: boolean,
    platform: NodeJS.Platform = process.platform,
): LaunchAtLoginState {
    if (api === undefined || !is_available(api, platform)) {
        return { available: false, enabled: false };
    }
    api.setLoginItemSettings({ openAtLogin: enabled });
    return read_launch_at_login(api, platform);
}

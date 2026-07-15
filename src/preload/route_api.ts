import type { GrokReadonlyApi, GrokSettingsApi } from "../shared/types/ipc";

export function select_grok_api(
    route: string,
    readonly_api: GrokReadonlyApi,
    settings_api: GrokSettingsApi,
): GrokReadonlyApi | GrokSettingsApi {
    return route === "settings" ? settings_api : readonly_api;
}

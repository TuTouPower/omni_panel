import { describe, expect, it, vi } from "vitest";
import { select_grok_api } from "../../../src/preload/route_api";
import type { GrokReadonlyApi, GrokSettingsApi } from "../../../src/shared/types/ipc";

function create_grok_apis(): {
    readonly readonly_api: GrokReadonlyApi;
    readonly settings_api: GrokSettingsApi;
} {
    const readonly_api: GrokReadonlyApi = {
        login_status: vi.fn(),
    };
    return {
        readonly_api,
        settings_api: {
            ...readonly_api,
            login_start: vi.fn(),
            login_poll: vi.fn(),
            logout: vi.fn(),
            refresh: vi.fn(),
        },
    };
}

describe("select_grok_api", () => {
    it("exposes the full Grok API to setting", () => {
        const { readonly_api, settings_api } = create_grok_apis();

        const api = select_grok_api("setting", readonly_api, settings_api);

        expect(Object.keys(api).sort()).toEqual([
            "login_poll",
            "login_start",
            "login_status",
            "logout",
            "refresh",
        ]);
    });

    it.each(["usage", "agent", "tray", "unknown"])(
        "exposes only Grok login status to %s",
        (route) => {
            const { readonly_api, settings_api } = create_grok_apis();

            const api = select_grok_api(route, readonly_api, settings_api);

            expect(Object.keys(api)).toEqual(["login_status"]);
        },
    );
});

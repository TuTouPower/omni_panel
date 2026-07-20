import { describe, expect, it, vi } from "vitest";
import { select_grok_api, select_trend_api } from "../../../src/preload/route_api";
import type { GrokReadonlyApi, GrokSettingsApi, TrendApi } from "../../../src/shared/types/ipc";

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

describe("select_trend_api", () => {
    function create_trend_apis(): {
        readonly full_api: TrendApi;
        readonly disabled_api: TrendApi;
    } {
        const full_api: TrendApi = {
            get: vi.fn().mockResolvedValue([]),
        };
        const disabled_api: TrendApi = {
            get: vi.fn().mockResolvedValue([]),
        };
        return { full_api, disabled_api };
    }

    it.each(["usage", "agent", "unknown"])("exposes full trend API to %s route", (route) => {
        const { full_api, disabled_api } = create_trend_apis();

        const api = select_trend_api(route, full_api, disabled_api);

        expect(api).toBe(full_api);
    });

    it.each(["setting", "tray"])("exposes disabled trend API to %s route", async (route) => {
        const { full_api, disabled_api } = create_trend_apis();

        const api = select_trend_api(route, full_api, disabled_api);

        expect(api).toBe(disabled_api);
        // Lock the noop contract: disabled routes resolve to [] without throwing,
        // so setting/tray never see real trend data nor break on the IPC call.
        await expect(api.get("any", "any", "any")).resolves.toEqual([]);
    });
});

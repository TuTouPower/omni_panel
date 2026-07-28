import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/types/ipc";
import { create_grok_oauth_apis, create_kimi_oauth_apis } from "../../../src/preload/oauth_api";
import type { OAuthApiFactoryDeps } from "../../../src/preload/oauth_api";

function create_invoke(): OAuthApiFactoryDeps["invoke"] {
    return vi.fn(() => Promise.resolve({})) as OAuthApiFactoryDeps["invoke"];
}

describe("OAuth preload APIs", () => {
    it("keeps Grok readonly and settings API capabilities and IPC argument order", async () => {
        const invoke = create_invoke();
        const { readonly_api, settings_api } = create_grok_oauth_apis({ invoke });

        expect(Object.keys(readonly_api)).toEqual(["login_status"]);
        expect(Object.keys(settings_api)).toEqual([
            "login_start",
            "login_poll",
            "login_cancel",
            "login_status",
            "logout",
            "refresh",
        ]);
        await settings_api.login_poll("grok-1", "device-code", 5, 1234);

        expect(invoke).toHaveBeenCalledWith(
            IPC_CHANNELS.GROK_LOGIN_POLL,
            "grok-1",
            "device-code",
            5,
            1234,
        );
    });

    it("uses the Kimi IPC channels without exposing settings methods to readonly routes", async () => {
        const invoke = create_invoke();
        const { readonly_api, settings_api } = create_kimi_oauth_apis({ invoke });

        expect(Object.keys(readonly_api)).toEqual(["login_status"]);
        await readonly_api.login_status("kimi-1");
        await settings_api.logout("kimi-1");

        expect(invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.KIMI_LOGIN_STATUS, "kimi-1");
        expect(invoke).toHaveBeenNthCalledWith(2, IPC_CHANNELS.KIMI_LOGOUT, "kimi-1");
    });
});

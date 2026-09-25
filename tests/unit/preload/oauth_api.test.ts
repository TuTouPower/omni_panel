import { describe, expect, it, vi } from "vitest";
import { IPC_CHANNELS } from "../../../src/shared/types/ipc";
import {
    create_grok_oauth_apis,
    create_kimi_oauth_apis,
    create_grok_bot_oauth_apis,
} from "../../../src/preload/oauth_api";
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

    it("creates Grok Bot oauth APIs with rejecting readonly stubs and functioning settings APIs (t511 / A144)", async () => {
        const invoke = create_invoke();
        const { readonly_api, settings_api } = create_grok_bot_oauth_apis({ invoke });

        // readonly stubs should all reject
        await expect(readonly_api.login_start()).rejects.toThrow("only available from settings");
        await expect(readonly_api.login_poll("inst", "uuid", "verifier", 1000)).rejects.toThrow(
            "only available from settings",
        );
        await expect(readonly_api.login_cancel("inst")).rejects.toThrow(
            "only available from settings",
        );
        await expect(readonly_api.logout("inst")).rejects.toThrow("only available from settings");
        await expect(readonly_api.refresh("inst")).rejects.toThrow("only available from settings");
        expect(invoke).not.toHaveBeenCalled();

        // settings api calls through to invoke with proper channels
        await settings_api.login_start();
        expect(invoke).toHaveBeenNthCalledWith(1, IPC_CHANNELS.GROK_BOT_LOGIN_START);

        await settings_api.login_poll("inst-1", "uuid-1", "verifier-1", 15000);
        expect(invoke).toHaveBeenNthCalledWith(
            2,
            IPC_CHANNELS.GROK_BOT_LOGIN_POLL,
            "inst-1",
            "uuid-1",
            "verifier-1",
            15000,
        );

        await settings_api.login_cancel("inst-1");
        expect(invoke).toHaveBeenNthCalledWith(3, IPC_CHANNELS.GROK_BOT_LOGIN_CANCEL, "inst-1");

        await settings_api.logout("inst-1");
        expect(invoke).toHaveBeenNthCalledWith(4, IPC_CHANNELS.GROK_BOT_LOGOUT, "inst-1");

        await settings_api.refresh("inst-1");
        expect(invoke).toHaveBeenNthCalledWith(5, IPC_CHANNELS.GROK_BOT_REFRESH, "inst-1");
    });
});

import { describe, expect, it, vi } from "vitest";
import {
    handle_grok_bot_login_start,
    handle_grok_bot_login_poll,
    handle_grok_bot_login_cancel,
    handle_grok_bot_logout,
    handle_grok_bot_refresh,
} from "../../../src/main/ipc/grok_bot_auth_ipc";
import type { GrokBotOAuthManager } from "../../../src/main/core/auth/grok_bot_oauth_manager";

interface MockManagerResult {
    manager: GrokBotOAuthManager;
    start_login: ReturnType<typeof vi.fn>;
    await_completion: ReturnType<typeof vi.fn>;
    cancel_login: ReturnType<typeof vi.fn>;
    refresh_now: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
}

function create_mock_manager(): MockManagerResult {
    const start_login = vi.fn().mockResolvedValue({
        auth_url: "https://cursor.com/loginDeepControl?challenge=c&uuid=u",
        uuid: "u",
        verifier: "v",
    });
    const await_completion = vi.fn().mockResolvedValue({
        saved: true,
        token: "access-token-123",
        refresh_token: "refresh-token-456",
    });
    const cancel_login = vi.fn();
    const refresh_now = vi.fn().mockResolvedValue({
        ok: true,
        access_token: "fresh-access-token",
    });
    const logout = vi.fn().mockResolvedValue(undefined);
    const shutdown = vi.fn();

    return {
        manager: {
            start_login,
            await_completion,
            cancel_login,
            refresh_now,
            logout,
            shutdown,
        },
        start_login,
        await_completion,
        cancel_login,
        refresh_now,
        logout,
    };
}

describe("grok_bot_auth_ipc handlers", () => {
    it("handles login_start ok", async () => {
        const { manager } = create_mock_manager();
        const res = await handle_grok_bot_login_start({ manager });
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.uuid).toBe("u");
            expect(res.data.auth_url).toContain("cursor.com");
        }
    });

    it("handles login_start error", async () => {
        const { manager, start_login } = create_mock_manager();
        start_login.mockRejectedValueOnce(new Error("fail to start"));
        const res = await handle_grok_bot_login_start({ manager });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error.code).toBe("INTERNAL_ERROR");
            expect(res.error.message).toBe("fail to start");
        }
    });

    it("handles login_poll ok", async () => {
        const { manager } = create_mock_manager();
        const res = await handle_grok_bot_login_poll({ manager }, "inst_1", "u", "v", 5000);
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.saved).toBe(true);
            expect(res.data.token).toBe("access-token-123");
        }
    });

    it("handles login_cancel", () => {
        const { manager, cancel_login } = create_mock_manager();
        const res = handle_grok_bot_login_cancel({ manager }, "inst_1");
        expect(res.ok).toBe(true);
        expect(cancel_login).toHaveBeenCalledWith("inst_1");
    });

    it("handles logout", async () => {
        const { manager } = create_mock_manager();
        const res = await handle_grok_bot_logout({ manager }, "inst_1");
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.logged_out).toBe(true);
        }
    });

    it("handles refresh ok", async () => {
        const { manager } = create_mock_manager();
        const res = await handle_grok_bot_refresh({ manager }, "inst_1");
        expect(res.ok).toBe(true);
        if (res.ok) {
            expect(res.data.ok).toBe(true);
            expect(res.data.access_token).toBe("fresh-access-token");
        }
    });
});

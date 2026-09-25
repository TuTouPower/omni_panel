import { describe, expect, it, vi } from "vitest";
import { ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import { IPC_CHANNELS } from "../../../src/shared/types/ipc";
import { set_renderer_index_path } from "../../../src/main/ipc/helpers";
import {
    handle_grok_bot_login_start,
    handle_grok_bot_login_poll,
    handle_grok_bot_login_cancel,
    handle_grok_bot_logout,
    handle_grok_bot_refresh,
    registerGrokBotAuthIpc,
} from "../../../src/main/ipc/grok_bot_auth_ipc";
import type { GrokBotOAuthManager } from "../../../src/main/core/auth/grok_bot_oauth_manager";

set_renderer_index_path(fileURLToPath("file:///renderer/index.html"));

vi.mock("electron", () => ({
    ipcMain: {
        handle: vi.fn(),
    },
}));

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

    it("handles login_start browser open failure error code (A24 / A127)", async () => {
        const { manager, start_login } = create_mock_manager();
        start_login.mockRejectedValueOnce(new Error("BROWSER_OPEN_FAILED"));
        const res = await handle_grok_bot_login_start({ manager });
        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error.code).toBe("BROWSER_OPEN_FAILED");
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

    it("registers IPC handlers and validates arguments clamp (A28 / AC-007)", async () => {
        const handlers = new Map<string, (...args: unknown[]) => Promise<unknown>>();
        (ipcMain.handle as unknown as ReturnType<typeof vi.fn>).mockImplementation(
            (channel: string, listener: (...args: unknown[]) => Promise<unknown>) => {
                handlers.set(channel, listener);
            },
        );

        const { manager } = create_mock_manager();
        registerGrokBotAuthIpc({ manager });

        const poll_handler = handlers.get(IPC_CHANNELS.GROK_BOT_LOGIN_POLL);
        expect(poll_handler).toBeDefined();
        if (!poll_handler) throw new Error("poll_handler not registered");

        const fake_event = { senderFrame: { url: "file:///renderer/index.html" } };

        // 验证空参数
        const res_empty_id = (await poll_handler(fake_event, "", "u", "v")) as {
            ok: boolean;
            error: { code: string };
        };
        expect(res_empty_id.ok).toBe(false);
        expect(res_empty_id.error.code).toBe("INVALID_ARGUMENT");

        // 验证 timeout < 10000ms 被拒绝
        const res_small_timeout = (await poll_handler(fake_event, "inst-1", "u", "v", 5000)) as {
            ok: boolean;
            error: { code: string };
        };
        expect(res_small_timeout.ok).toBe(false);
        expect(res_small_timeout.error.code).toBe("INVALID_ARGUMENT");

        // 验证 timeout > 600000ms 被拒绝
        const res_huge_timeout = (await poll_handler(fake_event, "inst-1", "u", "v", 700_000)) as {
            ok: boolean;
            error: { code: string };
        };
        expect(res_huge_timeout.ok).toBe(false);
        expect(res_huge_timeout.error.code).toBe("INVALID_ARGUMENT");

        // 验证合法范围 15000ms 成功通过
        const res_valid = (await poll_handler(fake_event, "inst-1", "u", "v", 15000)) as {
            ok: boolean;
            data: { saved: boolean };
        };
        expect(res_valid.ok).toBe(true);
        expect(res_valid.data.saved).toBe(true);
    });

    it("maps CONFLICT error when manager throws conflict (A5 / A127)", async () => {
        const { manager, await_completion } = create_mock_manager();
        await_completion.mockRejectedValueOnce(new Error("CONFLICT: another poll active"));

        const res = await handle_grok_bot_login_poll({ manager }, "inst_1", "u", "v", 15000);

        expect(res.ok).toBe(false);
        if (!res.ok) {
            expect(res.error.code).toBe("CONFLICT");
        }
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { IpcMainInvokeEvent } from "electron";
import type { GrokOAuthManager } from "../../../src/main/core/auth/grok_oauth_manager";

vi.mock("electron", () => ({
    ipcMain: {
        handle: vi.fn(),
    },
}));

function create_manager_mock(): GrokOAuthManager & {
    start_device_login: ReturnType<typeof vi.fn>;
    await_completion: ReturnType<typeof vi.fn>;
    cancel_device_login: ReturnType<typeof vi.fn>;
    get_login_status: ReturnType<typeof vi.fn>;
    refresh_now: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
    start_auto_refresh: ReturnType<typeof vi.fn>;
    stop_auto_refresh: ReturnType<typeof vi.fn>;
    reconcile_auto_refresh: ReturnType<typeof vi.fn>;
    shutdown: ReturnType<typeof vi.fn>;
} {
    return {
        start_device_login: vi.fn(),
        await_completion: vi.fn(),
        cancel_device_login: vi.fn(),
        get_login_status: vi.fn(),
        refresh_now: vi.fn(),
        logout: vi.fn(),
        start_auto_refresh: vi.fn(),
        stop_auto_refresh: vi.fn(),
        reconcile_auto_refresh: vi.fn(),
        shutdown: vi.fn(),
    };
}

describe("grok_auth_ipc handlers", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("handle_grok_login_start delegates to manager.start_device_login", async () => {
        const manager = create_manager_mock();
        const device_start = {
            device_code: "dc-1",
            user_code: "ABCD-EFGH",
            verification_uri: "https://auth.x.ai/device",
            verification_uri_complete: "https://auth.x.ai/device?user_code=ABCD-EFGH",
            expires_in: 1800,
            interval: 5,
        };
        manager.start_device_login.mockResolvedValue(device_start);

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_login_start({ manager });

        expect(manager.start_device_login).toHaveBeenCalledOnce();
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data).toEqual(device_start);
        }
    });

    it("handle_grok_login_start returns INTERNAL_ERROR on failure", async () => {
        const manager = create_manager_mock();
        manager.start_device_login.mockRejectedValue(new Error("network down"));

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_login_start({ manager });

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("INTERNAL_ERROR");
            expect(result.error.message).toContain("network down");
        }
    });

    it("handle_grok_login_poll delegates to manager.await_completion with provided args", async () => {
        const manager = create_manager_mock();
        manager.await_completion.mockResolvedValue({ saved: true });

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_login_poll(
            { manager },
            "grok-inst-1",
            "dc-1",
            5,
            Date.now() + 1800_000,
        );

        expect(manager.await_completion).toHaveBeenCalledWith(
            "dc-1",
            5,
            expect.any(Number),
            "grok-inst-1",
        );
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data).toEqual({ saved: true });
        }
    });

    it("handle_grok_login_poll returns OAUTH_ERROR when manager throws expired_token", async () => {
        const manager = create_manager_mock();
        manager.await_completion.mockRejectedValue(new Error("expired_token: foo"));

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_login_poll(
            { manager },
            "grok-inst-2",
            "dc-2",
            5,
            Date.now() + 1800_000,
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("OAUTH_ERROR");
        }
    });

    it("handle_grok_login_status delegates to manager.get_login_status", async () => {
        const manager = create_manager_mock();
        manager.get_login_status.mockResolvedValue({
            has_token: true,
            expires_at: "12345",
            can_refresh: true,
        });

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_login_status({ manager }, "grok-inst-1");

        expect(manager.get_login_status).toHaveBeenCalledWith("grok-inst-1");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.has_token).toBe(true);
            expect(result.data.can_refresh).toBe(true);
        }
    });

    it("handle_grok_logout delegates to manager.logout and stops auto-refresh", async () => {
        const manager = create_manager_mock();
        manager.logout.mockResolvedValue(undefined);

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_logout({ manager }, "grok-inst-1");

        expect(manager.logout).toHaveBeenCalledWith("grok-inst-1");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data).toEqual({ logged_out: true });
        }
    });

    it("handle_grok_refresh delegates to manager.refresh_now", async () => {
        const manager = create_manager_mock();
        manager.refresh_now.mockResolvedValue({ success: true });

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_refresh({ manager }, "grok-inst-1");

        expect(manager.refresh_now).toHaveBeenCalledWith("grok-inst-1");
        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.success).toBe(true);
        }
    });

    it("handle_grok_refresh returns failure result without throwing on refresh failure", async () => {
        const manager = create_manager_mock();
        manager.refresh_now.mockResolvedValue({ success: false, error: "invalid_grant" });

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        const result = await mod.handle_grok_refresh({ manager }, "grok-inst-2");

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.success).toBe(false);
            expect(result.data.error).toBe("invalid_grant");
        }
    });

    it("registered handlers reject external senders and allow the app renderer", async () => {
        const { ipcMain } = await import("electron");
        const manager = create_manager_mock();
        manager.start_device_login.mockResolvedValue({
            device_code: "dc-1",
            user_code: "ABCD-EFGH",
            verification_uri: "https://auth.x.ai/device",
            verification_uri_complete: null,
            expires_in: 1800,
            interval: 5,
        });
        manager.await_completion.mockResolvedValue({ saved: true });
        manager.get_login_status.mockResolvedValue({
            has_token: false,
            expires_at: null,
            can_refresh: false,
        });
        manager.logout.mockResolvedValue(undefined);
        manager.refresh_now.mockResolvedValue({ success: true });

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        mod.registerGrokAuthIpc({ manager });

        const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls as [
            string,
            (...args: unknown[]) => unknown,
        ][];
        const arguments_by_channel: Record<string, unknown[]> = {
            "grok:loginStart": [],
            "grok:loginPoll": ["grok-inst-1", "dc-1", 5, Date.now() + 1800_000],
            "grok:loginCancel": ["grok-inst-1"],
            "grok:loginStatus": ["grok-inst-1"],
            "grok:logout": ["grok-inst-1"],
            "grok:refresh": ["grok-inst-1"],
        };
        const external_event = {
            senderFrame: { url: "https://evil.example/" },
        } as IpcMainInvokeEvent;
        const app_event = {
            senderFrame: { url: "file:///D:/Dev/Code/omni_panel/out/renderer/index.html#settings" },
        } as IpcMainInvokeEvent;

        for (const [channel, handler] of calls) {
            const args = arguments_by_channel[channel];
            expect(args).toBeDefined();
            await expect(
                Promise.resolve().then(() => handler(external_event, ...(args ?? []))),
            ).rejects.toThrow(/Invalid sender protocol/);
            await expect(
                Promise.resolve().then(() => handler(app_event, ...(args ?? []))),
            ).resolves.toBeDefined();
        }
    });

    it("registerGrokAuthIpc registers all six handlers", async () => {
        const { ipcMain } = await import("electron");
        const manager = create_manager_mock();

        const mod = await import("../../../src/main/ipc/grok_auth_ipc");
        mod.registerGrokAuthIpc({ manager });

        const handle_mock = (ipcMain.handle as ReturnType<typeof vi.fn>).mock;
        const registered_channels = handle_mock.calls.map((call: unknown[]) => call[0]);
        expect(registered_channels).toContain("grok:loginStart");
        expect(registered_channels).toContain("grok:loginPoll");
        expect(registered_channels).toContain("grok:loginCancel");
        expect(registered_channels).toContain("grok:loginStatus");
        expect(registered_channels).toContain("grok:logout");
        expect(registered_channels).toContain("grok:refresh");
    });
});

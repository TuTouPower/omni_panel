/* eslint-disable @typescript-eslint/unbound-method */
import { fileURLToPath } from "node:url";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { set_renderer_index_path } from "../../../src/main/ipc/helpers";
import type { SessionManager } from "../../../src/main/core/session/session-manager";

set_renderer_index_path(fileURLToPath("file:///D:/Kar/Code/omni_panel/out/renderer/index.html"));

vi.mock("electron", () => ({
    ipcMain: {
        handle: vi.fn(),
    },
}));

describe("handleSessionLogin", () => {
    let mock_session_manager: SessionManager;

    beforeEach(() => {
        vi.clearAllMocks();
        mock_session_manager = {
            start_login: vi.fn(),
        };
    });

    it("returns saved:true when session manager succeeds", async () => {
        vi.mocked(mock_session_manager.start_login).mockResolvedValue({ saved: true });

        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(true);
        }
        expect(mock_session_manager.start_login).toHaveBeenCalledWith({
            instance_id: "test-instance",
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["SESSION"],
        });
    });

    it("returns saved:false when no cookies captured", async () => {
        vi.mocked(mock_session_manager.start_login).mockResolvedValue({ saved: false });

        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(true);
        if (result.ok) {
            expect(result.data.saved).toBe(false);
        }
    });

    it("returns CONFLICT when login already in progress", async () => {
        vi.mocked(mock_session_manager.start_login).mockRejectedValue(
            new Error("Login already in progress for instance: test-instance"),
        );

        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("CONFLICT");
        }
    });

    it("returns TIMEOUT when login times out", async () => {
        vi.mocked(mock_session_manager.start_login).mockRejectedValue(new Error("Login timed out"));

        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("TIMEOUT");
        }
    });

    it("allows anonymous login without instance_id", async () => {
        vi.mocked(mock_session_manager.start_login).mockResolvedValue({ saved: false });

        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result).toEqual({ ok: true, data: { saved: false } });
        expect(mock_session_manager.start_login).toHaveBeenCalledWith({
            provider: "mimo",
            login_url: "https://example.com/login",
            cookie_names: ["SESSION"],
        });
    });

    it("returns captured Cookie from anonymous login", async () => {
        vi.mocked(mock_session_manager.start_login).mockResolvedValue({
            saved: true,
            cookie: "session=abc",
        });

        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
            },
        );

        expect(result).toEqual({ ok: true, data: { saved: true, cookie: "session=abc" } });
        expect(mock_session_manager.start_login).toHaveBeenCalledWith({
            provider: "opencode_go",
            login_url: "https://opencode.ai/auth",
            cookie_names: ["*"],
        });
    });

    it("returns VALIDATION_ERROR when login_url is missing", async () => {
        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
    });

    it("returns VALIDATION_ERROR when cookie_names is not an array", async () => {
        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: "not-an-array" as unknown as string[],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(mock_session_manager.start_login).not.toHaveBeenCalled();
    });

    it("returns VALIDATION_ERROR when cookie_names is empty", async () => {
        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: [],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
    });

    it("returns INTERNAL_ERROR for unexpected errors", async () => {
        vi.mocked(mock_session_manager.start_login).mockRejectedValue("unknown error");

        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("INTERNAL_ERROR");
        }
    });

    it("redacts session cookies and error bodies from development IPC logs", async () => {
        const previous_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "development";
        const { addTransport, setLogLevel } = await import("../../../src/shared/lib/logger");
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const { ipcMain } = await import("electron");
            const manager = {
                start_login: vi.fn().mockResolvedValue({
                    saved: true,
                    cookie: "session-development-cookie-sentinel",
                }),
            } as unknown as SessionManager;
            const mod = await import("../../../src/main/ipc/session-ipc");
            await mod.registerSessionIpc({ sessionManager: manager });

            const calls = (ipcMain.handle as ReturnType<typeof vi.fn>).mock.calls as [
                string,
                (event: unknown, request: unknown) => Promise<unknown>,
            ][];
            const login_handler = calls.find(([channel]) => channel === "session:login")?.[1];
            if (!login_handler) throw new Error("session:login handler was not registered");
            const event = {
                senderFrame: { url: "file:///D:/Kar/Code/omni_panel/out/renderer/index.html" },
            };
            const request = {
                instance_id: "test-instance",
                provider: "mimo",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            };

            await login_handler(event, request);
            vi.mocked(manager.start_login).mockRejectedValue(
                new Error(
                    "OAuth response contained access-token-sentinel refresh-token-sentinel and session-development-cookie-sentinel",
                ),
            );
            await login_handler(event, request);

            const output = lines.join("\n");
            expect(output).not.toContain("access-token-sentinel");
            expect(output).not.toContain("refresh-token-sentinel");
            expect(output).not.toContain("session-development-cookie-sentinel");
        } finally {
            remove_transport();
            if (previous_node_env === undefined) delete process.env["NODE_ENV"];
            else process.env["NODE_ENV"] = previous_node_env;
        }
    });
});

/* eslint-disable @typescript-eslint/unbound-method */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionManager } from "../../../src/main/core/session/session-manager";

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
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("TIMEOUT");
        }
    });

    it("returns VALIDATION_ERROR when instance_id is missing", async () => {
        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "",
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
        expect(mock_session_manager.start_login).not.toHaveBeenCalled();
    });

    it("returns VALIDATION_ERROR when login_url is missing", async () => {
        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
                login_url: "",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("VALIDATION_ERROR");
        }
    });

    it("returns VALIDATION_ERROR when cookie_names is empty", async () => {
        const mod = await import("../../../src/main/ipc/session-ipc");
        const result = await mod.handleSessionLogin(
            { sessionManager: mock_session_manager },
            {
                instance_id: "test-instance",
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
                login_url: "https://example.com/login",
                cookie_names: ["SESSION"],
            },
        );

        expect(result.ok).toBe(false);
        if (!result.ok) {
            expect(result.error.code).toBe("INTERNAL_ERROR");
        }
    });
});

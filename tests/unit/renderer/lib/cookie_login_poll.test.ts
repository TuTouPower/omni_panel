import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    COOKIE_LOGIN_MESSAGES,
    COOKIE_LOGIN_POLL_TIMEOUT_MS,
    format_cookie_login_error,
    poll_cookie_login,
} from "../../../../src/renderer/lib/cookie_login_poll";

describe("format_cookie_login_error", () => {
    it("maps CONFLICT IPC prefix to Chinese conflict copy", () => {
        expect(format_cookie_login_error(new Error("[CONFLICT] already in progress"))).toBe(
            COOKIE_LOGIN_MESSAGES.conflict,
        );
    });

    it("strips web HTTP prefix and keeps Chinese body", () => {
        expect(
            format_cookie_login_error(
                new Error(`POST /v1/auth/cookieLogin failed: ${COOKIE_LOGIN_MESSAGES.conflict}`),
            ),
        ).toBe(COOKIE_LOGIN_MESSAGES.conflict);
    });

    it("maps English timeout text to Chinese timeout copy", () => {
        expect(format_cookie_login_error(new Error("Login timed out"))).toBe(
            COOKIE_LOGIN_MESSAGES.timeout,
        );
    });

    it("does not leak raw English already-in-progress text", () => {
        const message = format_cookie_login_error(
            new Error("Login already in progress for instance: anon"),
        );
        expect(message).toBe(COOKIE_LOGIN_MESSAGES.conflict);
        expect(message).not.toMatch(/already in progress/i);
    });
});

describe("poll_cookie_login", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        window.usageboard = {
            auth: {
                cookieLogin: vi.fn(),
                cookieLoginStatus: vi.fn(),
            },
        } as unknown as typeof window.usageboard;
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.clearAllMocks();
    });

    it("polls until saved and resolves", async () => {
        const cookie_login = vi.fn().mockResolvedValue({ started: true });
        const cookie_login_status = vi
            .fn()
            .mockResolvedValueOnce({ in_progress: true, saved: false })
            .mockResolvedValueOnce({ in_progress: false, saved: true });
        window.usageboard.auth.cookieLogin = cookie_login;
        window.usageboard.auth.cookieLoginStatus = cookie_login_status;

        const done = poll_cookie_login("mimo-1");
        await vi.advanceTimersByTimeAsync(250);
        await done;

        expect(cookie_login).toHaveBeenCalledWith("mimo-1");
        expect(cookie_login_status).toHaveBeenCalledTimes(2);
    });

    it("throws Chinese timeout when status stays in_progress past 120s", async () => {
        const cookie_login = vi.fn().mockResolvedValue({ started: true });
        const cookie_login_status = vi
            .fn()
            .mockResolvedValue({ in_progress: true, saved: false });
        window.usageboard.auth.cookieLogin = cookie_login;
        window.usageboard.auth.cookieLoginStatus = cookie_login_status;

        const done = poll_cookie_login("mimo-1");
        const expectation = expect(done).rejects.toThrow(COOKIE_LOGIN_MESSAGES.timeout);
        await vi.advanceTimersByTimeAsync(COOKIE_LOGIN_POLL_TIMEOUT_MS + 250);
        await expectation;
        expect(cookie_login_status).toHaveBeenCalled();
    });

    it("rethrows status error through Chinese conflict formatter", async () => {
        window.usageboard.auth.cookieLogin = vi.fn().mockResolvedValue({ started: true });
        window.usageboard.auth.cookieLoginStatus = vi.fn().mockResolvedValue({
            in_progress: false,
            saved: false,
            error: "Login already in progress for instance: mimo-1",
        });

        await expect(poll_cookie_login("mimo-1")).rejects.toThrow(COOKIE_LOGIN_MESSAGES.conflict);
    });
});

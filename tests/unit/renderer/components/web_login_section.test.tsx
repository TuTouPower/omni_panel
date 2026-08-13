import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebLoginSection } from "../../../../src/renderer/components/WebLoginSection";
import {
    COOKIE_LOGIN_MESSAGES,
    COOKIE_LOGIN_POLL_TIMEOUT_MS,
} from "../../../../src/renderer/lib/cookie_login_poll";

function render_section(overrides: Partial<React.ComponentProps<typeof WebLoginSection>> = {}) {
    const onChange = vi.fn();
    const onSecrets = vi.fn().mockResolvedValue(undefined);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const props = {
        provider: "opencode_go",
        login_url: "https://opencode.ai/auth",
        secret_name: "SESSION_COOKIE",
        value: "",
        onChange,
        onSecrets,
        onSaved,
        ...overrides,
    };
    return { ...render(<WebLoginSection {...props} />), onChange, onSecrets, onSaved };
}

describe("WebLoginSection cookie login parity (t282)", () => {
    let session_login: ReturnType<typeof vi.fn>;
    let cookie_login: ReturnType<typeof vi.fn>;
    let cookie_login_status: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        vi.clearAllMocks();
        session_login = vi.fn().mockResolvedValue({ saved: true, cookie: "session=abc" });
        cookie_login = vi.fn();
        cookie_login_status = vi.fn();
        window.usageboard = {
            auth: {
                cookieLogin: cookie_login,
                cookieLoginStatus: cookie_login_status,
            },
            session: {
                login: session_login,
            },
        } as unknown as typeof window.usageboard;
    });

    afterEach(() => {
        delete document.documentElement.dataset["web"];
        vi.useRealTimers();
    });

    it("web edit path uses shared cookieLogin poll and does not call session.login", async () => {
        document.documentElement.dataset["web"] = "";
        cookie_login.mockResolvedValue({ started: true });
        cookie_login_status
            .mockResolvedValueOnce({ in_progress: true, saved: false })
            .mockResolvedValueOnce({ in_progress: false, saved: true });
        const { onSaved, onSecrets } = render_section({ instance_id: "opencode-go-1" });
        const user = userEvent.setup();

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(cookie_login).toHaveBeenCalledWith("opencode-go-1");
            expect(cookie_login_status).toHaveBeenCalledTimes(2);
            expect(onSaved).toHaveBeenCalled();
        });
        expect(session_login).not.toHaveBeenCalled();
        expect(onSecrets).not.toHaveBeenCalled();
    });

    it("web edit path shows Chinese conflict without raw English", async () => {
        document.documentElement.dataset["web"] = "";
        cookie_login.mockRejectedValue(new Error("[CONFLICT] Login already in progress"));
        render_section({ instance_id: "opencode-go-1" });
        const user = userEvent.setup();

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByTestId("web-login-error-opencode_go")).toHaveTextContent(
                COOKIE_LOGIN_MESSAGES.conflict,
            );
        });
        expect(screen.getByTestId("web-login-error-opencode_go").textContent).not.toMatch(
            /already in progress/i,
        );
    });

    it("web edit path shows Chinese timeout after 120s poll", async () => {
        document.documentElement.dataset["web"] = "";
        vi.useFakeTimers();
        cookie_login.mockResolvedValue({ started: true });
        cookie_login_status.mockResolvedValue({ in_progress: true, saved: false });
        render_section({ instance_id: "opencode-go-1" });

        fireEvent.click(screen.getByText("网页登录"));
        // Flush cookieLogin / first status microtasks, then advance past poll deadline.
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });
        await act(async () => {
            await vi.advanceTimersByTimeAsync(COOKIE_LOGIN_POLL_TIMEOUT_MS + 1000);
        });
        // Drain remaining microtasks from the rejected poll promise → setState.
        await act(async () => {
            await Promise.resolve();
            await Promise.resolve();
        });

        expect(screen.getByTestId("web-login-error-opencode_go")).toHaveTextContent(
            COOKIE_LOGIN_MESSAGES.timeout,
        );
    });

    it("web add path (no instance_id) shows degrade guide and keeps manual paste recovery", () => {
        document.documentElement.dataset["web"] = "";
        render_section();

        expect(screen.getByTestId("web-login-anon-guide-opencode_go")).toHaveTextContent(
            COOKIE_LOGIN_MESSAGES.anon_web_guide,
        );
        expect(screen.getByLabelText("网页登录 Cookie")).toBeInTheDocument();
        expect(
            screen.getByText(/可点击网页登录自动捕获，也可手动粘贴 Cookie 后保存/),
        ).toBeInTheDocument();
    });

    it("desktop path still uses blocking session.login (AC-005)", async () => {
        session_login.mockResolvedValue({
            saved: true,
            cookie: "session=desktop",
        });
        const { onSecrets, onSaved } = render_section({ instance_id: "desktop-1" });
        const user = userEvent.setup();

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(session_login).toHaveBeenCalledWith({
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
                instance_id: "desktop-1",
            });
            expect(onSecrets).toHaveBeenCalledWith({ SESSION_COOKIE: "session=desktop" });
        });
        expect(cookie_login).not.toHaveBeenCalled();
        expect(onSaved).not.toHaveBeenCalled();
        expect(screen.queryByTestId("web-login-anon-guide-opencode_go")).not.toBeInTheDocument();
    });

    it("t331 AC-003: web add path 登录成功 UI 恢复 + auto_close_ms 透传", async () => {
        document.documentElement.dataset["web"] = "";
        session_login.mockResolvedValue({ saved: true, cookie: "session=webadd" });
        const { onSecrets } = render_section();
        const user = userEvent.setup();

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(session_login).toHaveBeenCalledWith({
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
                auto_close_ms: 1500,
            });
        });
        await waitFor(() => {
            // UI 从「正在打开登录窗口…」恢复（AC-003），登录成功触发 onSecrets。
            expect(screen.getByText("网页登录")).toBeTruthy();
            expect(onSecrets).toHaveBeenCalledWith({ SESSION_COOKIE: "session=webadd" });
        });
    });

    it("web add path maps concurrent session.login English error to Chinese", async () => {
        document.documentElement.dataset["web"] = "";
        session_login.mockRejectedValue(
            new Error("Login already in progress for instance: anonymous:x"),
        );
        render_section();
        const user = userEvent.setup();

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByTestId("web-login-error-opencode_go")).toHaveTextContent(
                COOKIE_LOGIN_MESSAGES.conflict,
            );
        });
        expect(screen.getByTestId("web-login-error-opencode_go").textContent).not.toMatch(
            /Login already/i,
        );
    });

    it("登录态无效时显示可读提示而非「未捕获到 Cookie」（t337 AC-004）", async () => {
        session_login.mockResolvedValue({ saved: false, reason: "invalid_cookie" });
        render_section();
        const user = userEvent.setup();

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByTestId("web-login-error-opencode_go")).toHaveTextContent(
                COOKIE_LOGIN_MESSAGES.invalid_cookie,
            );
        });
        expect(screen.getByTestId("web-login-error-opencode_go").textContent).not.toContain(
            COOKIE_LOGIN_MESSAGES.no_cookie,
        );
    });

    it("未捕获到 Cookie 时仍显示原提示（t337 AC-004 回归）", async () => {
        session_login.mockResolvedValue({ saved: false, reason: "no_cookie" });
        render_section();
        const user = userEvent.setup();

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByTestId("web-login-error-opencode_go")).toHaveTextContent(
                COOKIE_LOGIN_MESSAGES.no_cookie,
            );
        });
    });
});

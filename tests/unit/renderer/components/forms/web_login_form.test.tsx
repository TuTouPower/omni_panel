import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WebLoginForm } from "../../../../../src/renderer/components/forms/WebLoginForm";
import type { AddAccountParams } from "../../../../../src/renderer/components/AddAccountDialog";

function mock_session_api(result?: { saved: boolean; cookie?: string }, reject?: Error) {
    const session = {
        login: reject
            ? vi.fn().mockRejectedValueOnce(reject)
            : vi.fn().mockResolvedValue(result ?? { saved: true, cookie: "session=abc" }),
        refresh: vi.fn().mockResolvedValue({ saved: true, cookie: "" }),
    };
    (window as unknown as { usageboard: unknown }).usageboard = { session };
    return session;
}

describe("WebLoginForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function make_on_save() {
        return vi.fn().mockResolvedValue(undefined);
    }

    it("renders web login button and remark field", () => {
        mock_session_api();
        render(
            <WebLoginForm
                provider="opencode_go"
                login_url="https://opencode.ai/auth"
                secret_name="SESSION_COOKIE"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        expect(screen.getByPlaceholderText("例如：工作账号")).toBeInTheDocument();
        expect(screen.getByText("网页登录")).toBeInTheDocument();
        expect(screen.queryByPlaceholderText(/在浏览器登录/)).not.toBeInTheDocument();
    });

    it("calls session.login and on_save with cookie secret on success", async () => {
        const session = mock_session_api({
            saved: true,
            cookie: "session=abc; __Host-session=def",
        });
        const on_save = make_on_save();
        const user = userEvent.setup();
        render(
            <WebLoginForm
                provider="opencode_go"
                login_url="https://opencode.ai/auth"
                secret_name="SESSION_COOKIE"
                account_name="工作账号"
                set_account_name={() => undefined}
                on_save={on_save}
            />,
        );

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(session.login).toHaveBeenCalledWith({
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
            });
        });
        await waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const params = on_save.mock.calls[0]?.[0] as AddAccountParams;
        expect(params.vendor_id).toBe("opencode_go");
        expect(params.account_name).toBe("工作账号");
        expect(params.auth_method).toBe("web_login");
        expect(params.secrets).toEqual({ SESSION_COOKIE: "session=abc; __Host-session=def" });
    });

    it("shows error when login does not return cookie", async () => {
        mock_session_api({ saved: false });
        const user = userEvent.setup();
        render(
            <WebLoginForm
                provider="opencode_go"
                login_url="https://opencode.ai/auth"
                secret_name="SESSION_COOKIE"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByText("未捕获到 Cookie，请完成登录后再关闭窗口")).toBeInTheDocument();
        });
    });

    it("shows error when session.login rejects", async () => {
        mock_session_api(undefined, new Error("Login timed out"));
        const user = userEvent.setup();
        render(
            <WebLoginForm
                provider="opencode_go"
                login_url="https://opencode.ai/auth"
                secret_name="SESSION_COOKIE"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByText("Login timed out")).toBeInTheDocument();
        });
    });

    it("shows error when on_save rejects", async () => {
        mock_session_api({ saved: true, cookie: "session=abc" });
        const on_save = vi.fn().mockRejectedValueOnce(new Error("保存失败"));
        const user = userEvent.setup();
        render(
            <WebLoginForm
                provider="opencode_go"
                login_url="https://opencode.ai/auth"
                secret_name="SESSION_COOKIE"
                account_name=""
                set_account_name={() => undefined}
                on_save={on_save}
            />,
        );

        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByText("保存失败")).toBeInTheDocument();
        });
    });
});

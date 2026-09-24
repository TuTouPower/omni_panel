import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrokBotPkceForm } from "../../../../../src/renderer/components/forms/GrokBotPkceForm";
import type { AddAccountParams } from "../../../../../src/renderer/components/AddAccountDialog";

function mock_grok_bot_api(overrides: Record<string, unknown> = {}) {
    const grok_bot = {
        login_start: vi.fn().mockResolvedValue({
            auth_url: "https://cursor.com/loginDeepControl",
            uuid: "u123",
            verifier: "v456",
        }),
        login_poll: vi.fn().mockResolvedValue({
            saved: true,
            token: "access-jwt-token",
            refresh_token: "refresh-token-xyz",
        }),
        login_cancel: vi.fn().mockResolvedValue(undefined),
        logout: vi.fn().mockResolvedValue({ logged_out: true }),
        refresh: vi.fn().mockResolvedValue({ ok: true }),
        ...overrides,
    };
    (window as unknown as { usageboard: unknown }).usageboard = { grok_bot };
    return grok_bot;
}

describe("GrokBotPkceForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders remark field and browser login button", () => {
        mock_grok_bot_api();
        render(
            <GrokBotPkceForm
                instance_id="inst_1"
                account_name=""
                set_account_name={() => undefined}
                on_save={vi.fn()}
            />,
        );

        expect(screen.getByPlaceholderText("例如：工作账号")).toBeInTheDocument();
        expect(screen.getByText("浏览器登录授权")).toBeInTheDocument();
        expect(screen.getByText("手动输入 Token 备选")).toBeInTheDocument();
    });

    it("clicking browser login starts flow and calls on_save when completed", async () => {
        const user = userEvent.setup();
        const api = mock_grok_bot_api();
        const on_save = vi.fn().mockResolvedValue(undefined);

        render(
            <GrokBotPkceForm
                instance_id="inst_1"
                account_name="我的 Grok"
                set_account_name={() => undefined}
                on_save={on_save}
            />,
        );

        await user.click(screen.getByText("浏览器登录授权"));

        await waitFor(() => {
            expect(api.login_start).toHaveBeenCalled();
            expect(api.login_poll).toHaveBeenCalledWith("inst_1", "u123", "v456");
        });

        await waitFor(() => {
            expect(on_save).toHaveBeenCalledWith(
                expect.objectContaining({
                    vendor_id: "grok_bot",
                    account_name: "我的 Grok",
                    auth_method: "oauth_pkce",
                    secrets: {
                        ACCESS_TOKEN: "access-jwt-token",
                        REFRESH_TOKEN: "refresh-token-xyz",
                    },
                } satisfies Partial<AddAccountParams>),
            );
        });
    });

    it("clicking manual input allows pasting token directly", async () => {
        const user = userEvent.setup();
        mock_grok_bot_api();
        const on_save = vi.fn().mockResolvedValue(undefined);

        render(
            <GrokBotPkceForm
                instance_id="inst_manual"
                account_name=""
                set_account_name={() => undefined}
                on_save={on_save}
            />,
        );

        await user.click(screen.getByText("手动输入 Token 备选"));
        expect(screen.getByPlaceholderText("eyJhbGciOi...")).toBeInTheDocument();

        await user.type(screen.getByPlaceholderText("eyJhbGciOi..."), "manual-jwt-123");
        await user.click(screen.getByText("保存手动凭据"));

        await waitFor(() => {
            expect(on_save).toHaveBeenCalledWith(
                expect.objectContaining({
                    vendor_id: "grok_bot",
                    account_name: "Grok Bot",
                    auth_method: "oauth_pkce",
                    secrets: {
                        ACCESS_TOKEN: "manual-jwt-123",
                    },
                } satisfies Partial<AddAccountParams>),
            );
        });
    });

    it("shows error when login poll fails", async () => {
        const user = userEvent.setup();
        mock_grok_bot_api({
            login_poll: vi.fn().mockResolvedValue({
                saved: false,
                error: "登录授权超时，请重试",
            }),
        });

        render(
            <GrokBotPkceForm
                instance_id="inst_err"
                account_name=""
                set_account_name={() => undefined}
                on_save={vi.fn()}
            />,
        );

        await user.click(screen.getByText("浏览器登录授权"));
        await waitFor(() => {
            expect(screen.getByText("登录授权超时，请重试")).toBeInTheDocument();
        });
    });
});

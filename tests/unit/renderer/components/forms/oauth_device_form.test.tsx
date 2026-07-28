import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OAuthDeviceForm } from "../../../../../src/renderer/components/forms/OAuthDeviceForm";
import type { AddAccountParams } from "../../../../../src/renderer/components/AddAccountDialog";
import type { GrokDeviceCodeStart, GrokLoginStatus } from "../../../../../src/shared/types/ipc";

const instance_id = "grok-inst-1";

function mock_grok_api(overrides?: {
    login_status?: Partial<GrokLoginStatus>;
    login_start?: Partial<GrokDeviceCodeStart>;
    login_poll?: {
        saved: boolean;
        token?: string;
        refresh_token?: string;
        expires_at?: string;
    };
    login_poll_reject?: Error;
}) {
    const status: GrokLoginStatus = {
        has_token: false,
        expires_at: null,
        can_refresh: false,
        ...overrides?.login_status,
    };
    const start: GrokDeviceCodeStart = {
        device_code: "dc-123",
        user_code: "ABCD-EFGH",
        verification_uri: "https://auth.x.ai/device",
        verification_uri_complete: "https://auth.x.ai/device?user_code=ABCD-EFGH",
        expires_in: 1800,
        interval: 5,
        ...overrides?.login_start,
    };
    const grok = {
        login_start: vi.fn().mockResolvedValue(start),
        login_poll: overrides?.login_poll_reject
            ? vi.fn().mockRejectedValueOnce(overrides.login_poll_reject)
            : vi
                  .fn()
                  .mockResolvedValue(
                      overrides?.login_poll ?? { saved: true, token: "access-token-xyz" },
                  ),
        login_cancel: vi.fn().mockResolvedValue(undefined),
        login_status: vi.fn().mockResolvedValue(status),
        logout: vi.fn().mockResolvedValue({ logged_out: true }),
        refresh: vi.fn().mockResolvedValue({ success: true }),
    };
    (window as unknown as { usageboard: unknown }).usageboard = { grok };
    return grok;
}

describe("OAuthDeviceForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function make_on_save() {
        return vi.fn().mockResolvedValue(undefined);
    }

    it("renders start button and remark field", () => {
        mock_grok_api();
        render(
            <OAuthDeviceForm
                instance_id={instance_id}
                vendor="grok"
                vendor_id="grok"
                secret_name="OAUTH_TOKEN"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        expect(screen.getByPlaceholderText("例如：工作账号")).toBeInTheDocument();
        expect(screen.getByText("开始登录")).toBeInTheDocument();
    });

    it("shows the complete authorization URL and hides the user-code line (t156)", async () => {
        const grok = mock_grok_api();
        grok.login_poll.mockImplementation(() => new Promise(() => undefined));
        const user = userEvent.setup();
        render(
            <OAuthDeviceForm
                instance_id={instance_id}
                vendor="grok"
                vendor_id="grok"
                secret_name="OAUTH_TOKEN"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        await user.click(screen.getByText("开始登录"));

        await waitFor(() => {
            expect(grok.login_start).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(grok.login_poll).toHaveBeenCalledWith(
                instance_id,
                "dc-123",
                5,
                expect.any(Number),
            );
        });

        const link = await screen.findByRole("link", {
            name: "https://auth.x.ai/device?user_code=ABCD-EFGH",
        });
        expect(link).toHaveAttribute("href", "https://auth.x.ai/device?user_code=ABCD-EFGH");
        expect(screen.queryByText(/输入代码/)).not.toBeInTheDocument();
    });

    it("constructs a complete URL from verification_uri when the server omits verification_uri_complete (t156)", async () => {
        const grok = mock_grok_api({ login_start: { verification_uri_complete: null } });
        grok.login_poll.mockImplementation(() => new Promise(() => undefined));
        const user = userEvent.setup();
        render(
            <OAuthDeviceForm
                instance_id={instance_id}
                vendor="grok"
                vendor_id="grok"
                secret_name="OAUTH_TOKEN"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        await user.click(screen.getByText("开始登录"));

        const link = await screen.findByRole("link", {
            name: "https://auth.x.ai/device?user_code=ABCD-EFGH",
        });
        expect(link).toHaveAttribute("href", "https://auth.x.ai/device?user_code=ABCD-EFGH");
        expect(screen.queryByText(/输入代码/)).not.toBeInTheDocument();
    });

    it("falls back to the user-code line when user_code is empty (t156)", async () => {
        const grok = mock_grok_api({
            login_start: { verification_uri_complete: null, user_code: "" },
        });
        grok.login_poll.mockImplementation(() => new Promise(() => undefined));
        const user = userEvent.setup();
        render(
            <OAuthDeviceForm
                instance_id={instance_id}
                vendor="grok"
                vendor_id="grok"
                secret_name="OAUTH_TOKEN"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        await user.click(screen.getByText("开始登录"));

        await waitFor(() => {
            expect(screen.getByText(/输入代码/)).toBeInTheDocument();
        });
        expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("calls on_save with the temp instance id and complete OAuth params", async () => {
        mock_grok_api({
            login_poll: {
                saved: true,
                token: "access-token-xyz",
                refresh_token: "refresh-token-xyz",
                expires_at: "1785210000000",
            },
        });
        const on_save = make_on_save();
        const user = userEvent.setup();
        render(
            <OAuthDeviceForm
                instance_id={instance_id}
                vendor="grok"
                vendor_id="grok"
                secret_name="OAUTH_TOKEN"
                account_name="工作账号"
                set_account_name={() => undefined}
                on_save={on_save}
            />,
        );

        await user.click(screen.getByText("开始登录"));

        await waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const params = on_save.mock.calls[0]?.[0] as AddAccountParams;
        expect(params.vendor_id).toBe("grok");
        expect(params.account_name).toBe("工作账号");
        expect(params.auth_method).toBe("oauth_device");
        expect(params.oauth_source_instance_id).toBe(instance_id);
        expect(params.secrets).toEqual({
            OAUTH_TOKEN: "access-token-xyz",
            OAUTH_REFRESH_TOKEN: "refresh-token-xyz",
            OAUTH_EXPIRES_AT: "1785210000000",
        });
    });

    it("shows error and retry button when polling fails", async () => {
        const grok = mock_grok_api({ login_poll_reject: new Error("access_denied: user denied") });
        const user = userEvent.setup();
        render(
            <OAuthDeviceForm
                instance_id={instance_id}
                vendor="grok"
                vendor_id="grok"
                secret_name="OAUTH_TOKEN"
                account_name=""
                set_account_name={() => undefined}
                on_save={make_on_save()}
            />,
        );

        await user.click(screen.getByText("开始登录"));

        await waitFor(() => {
            expect(screen.getByText(/access_denied/)).toBeInTheDocument();
        });
        expect(screen.getByText("重新登录")).toBeInTheDocument();
        expect(grok.login_start).toHaveBeenCalledTimes(1);
    });

    it("shows error when on_save rejects after polling succeeds", async () => {
        mock_grok_api();
        const on_save = vi.fn().mockRejectedValue(new Error("保存账号失败"));
        const user = userEvent.setup();
        render(
            <OAuthDeviceForm
                instance_id={instance_id}
                vendor="grok"
                vendor_id="grok"
                secret_name="OAUTH_TOKEN"
                account_name=""
                set_account_name={() => undefined}
                on_save={on_save}
            />,
        );

        await user.click(screen.getByText("开始登录"));

        await waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(screen.getByText(/保存账号失败/)).toBeInTheDocument();
        });
        expect(screen.getByText("重新登录")).toBeInTheDocument();
    });

    it("dispatches to kimi api namespace when vendor is kimi", async () => {
        const kimi_start: GrokDeviceCodeStart = {
            device_code: "kimi-dc",
            user_code: "KIMI-CODE",
            verification_uri: "https://auth.kimi.com/device",
            verification_uri_complete: "https://auth.kimi.com/device?user_code=KIMI-CODE",
            expires_in: 1800,
            interval: 5,
        };
        const kimi = {
            login_start: vi.fn().mockResolvedValue(kimi_start),
            login_poll: vi.fn().mockResolvedValue({
                saved: true,
                token: "kimi-access-token",
                refresh_token: "kimi-refresh-token",
                expires_at: String(Date.now() + 3600_000),
            }),
            login_cancel: vi.fn().mockResolvedValue(undefined),
            login_status: vi.fn().mockResolvedValue({
                has_token: false,
                expires_at: null,
                can_refresh: false,
            }),
            logout: vi.fn().mockResolvedValue({ logged_out: true }),
            refresh: vi.fn().mockResolvedValue({ success: true }),
        };
        (window as unknown as { usageboard: unknown }).usageboard = { kimi };
        const on_save = make_on_save();
        const user = userEvent.setup();
        render(
            <OAuthDeviceForm
                instance_id="kimi-inst-1"
                vendor="kimi"
                vendor_id="kimi"
                secret_name="OAUTH_TOKEN"
                account_name=""
                set_account_name={() => undefined}
                on_save={on_save}
            />,
        );

        await user.click(screen.getByText("开始登录"));

        await waitFor(() => {
            expect(kimi.login_start).toHaveBeenCalledTimes(1);
        });
        expect(kimi.login_poll).toHaveBeenCalledWith(
            "kimi-inst-1",
            "kimi-dc",
            5,
            expect.any(Number),
        );
        // The full token set (access + refresh + expires_at) is persisted onto
        // the real connector instance via on_save.
        await waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved_params = on_save.mock.calls[0]?.[0] as AddAccountParams;
        expect(saved_params.oauth_source_instance_id).toBe("kimi-inst-1");
        expect(saved_params.secrets["OAUTH_TOKEN"]).toBe("kimi-access-token");
        expect(saved_params.secrets["OAUTH_REFRESH_TOKEN"]).toBe("kimi-refresh-token");
        expect(typeof saved_params.secrets["OAUTH_EXPIRES_AT"]).toBe("string");
    });
});

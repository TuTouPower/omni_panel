import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeviceLoginSection } from "../../../../src/renderer/components/DeviceLoginSection";
import type { GrokDeviceCodeStart, GrokLoginStatus } from "../../../../src/shared/types/ipc";

const instance_id = "test-inst-1";

function mock_grok_api(overrides?: {
    login_status?: Partial<GrokLoginStatus>;
    login_start?: Partial<GrokDeviceCodeStart>;
    login_poll?: { saved: boolean; token?: string; refresh_token?: string; expires_at?: string };
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

function mock_kimi_api(overrides?: {
    login_status?: Partial<GrokLoginStatus>;
    login_start?: Partial<GrokDeviceCodeStart>;
    login_poll?: { saved: boolean; token?: string; refresh_token?: string; expires_at?: string };
}) {
    const status: GrokLoginStatus = {
        has_token: false,
        expires_at: null,
        can_refresh: false,
        ...overrides?.login_status,
    };
    const start: GrokDeviceCodeStart = {
        device_code: "kimi-dc",
        user_code: "KIMI-CODE",
        verification_uri: "https://auth.kimi.com/device",
        verification_uri_complete: "https://auth.kimi.com/device?user_code=KIMI-CODE",
        expires_in: 1800,
        interval: 5,
        ...overrides?.login_start,
    };
    const kimi = {
        login_start: vi.fn().mockResolvedValue(start),
        login_poll: vi
            .fn()
            .mockResolvedValue(overrides?.login_poll ?? { saved: true, token: "kimi-token" }),
        login_cancel: vi.fn().mockResolvedValue(undefined),
        login_status: vi.fn().mockResolvedValue(status),
        logout: vi.fn().mockResolvedValue({ logged_out: true }),
        refresh: vi.fn().mockResolvedValue({ success: true }),
    };
    (window as unknown as { usageboard: unknown }).usageboard = { kimi };
    return kimi;
}

describe("DeviceLoginSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders login button for grok when not logged in", async () => {
        mock_grok_api();
        const on_secrets = vi.fn();
        render(
            <DeviceLoginSection vendor="grok" instance_id={instance_id} onSecrets={on_secrets} />,
        );

        await waitFor(() => {
            expect(screen.getByText("Grok 登录")).toBeInTheDocument();
        });
    });

    it("renders login button for kimi when not logged in", async () => {
        mock_kimi_api();
        const on_secrets = vi.fn();
        render(
            <DeviceLoginSection vendor="kimi" instance_id={instance_id} onSecrets={on_secrets} />,
        );

        await waitFor(() => {
            expect(screen.getByText("Kimi 登录")).toBeInTheDocument();
        });
    });

    it("shows complete authorization URL and hides user-code line", async () => {
        const grok = mock_grok_api();
        grok.login_poll.mockImplementation(() => new Promise(() => undefined));
        const user = userEvent.setup();
        render(<DeviceLoginSection vendor="grok" instance_id={instance_id} onSecrets={vi.fn()} />);

        await user.click(await screen.findByText("Grok 登录"));

        await waitFor(() => {
            expect(grok.login_start).toHaveBeenCalledTimes(1);
        });

        const link = await screen.findByRole("link", {
            name: "https://auth.x.ai/device?user_code=ABCD-EFGH",
        });
        expect(link).toHaveAttribute("href", "https://auth.x.ai/device?user_code=ABCD-EFGH");
        expect(screen.queryByText(/输入代码/)).not.toBeInTheDocument();
    });

    it("calls onSecrets with full token set after polling succeeds", async () => {
        mock_kimi_api({
            login_poll: {
                saved: true,
                token: "kimi-access-token",
                refresh_token: "kimi-refresh-token",
                expires_at: String(Date.now() + 3600_000),
            },
        });
        const on_secrets = vi.fn();
        const user = userEvent.setup();
        render(
            <DeviceLoginSection vendor="kimi" instance_id={instance_id} onSecrets={on_secrets} />,
        );

        await user.click(await screen.findByText("Kimi 登录"));

        await waitFor(() => {
            expect(on_secrets).toHaveBeenCalledTimes(1);
        });
        const secrets = on_secrets.mock.calls[0]?.[0] as Record<string, string>;
        expect(secrets["OAUTH_TOKEN"]).toBe("kimi-access-token");
        expect(secrets["OAUTH_REFRESH_TOKEN"]).toBe("kimi-refresh-token");
        expect(typeof secrets["OAUTH_EXPIRES_AT"]).toBe("string");
    });

    it("shows logout button when already logged in", async () => {
        mock_grok_api({
            login_status: {
                has_token: true,
                expires_at: "2026-12-31T00:00:00Z",
                can_refresh: true,
            },
        });
        render(<DeviceLoginSection vendor="grok" instance_id={instance_id} onSecrets={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText("退出登录")).toBeInTheDocument();
        });
    });

    it("shows error and retry button when polling fails", async () => {
        mock_grok_api({ login_poll_reject: new Error("access_denied: user denied") });
        const user = userEvent.setup();
        render(<DeviceLoginSection vendor="grok" instance_id={instance_id} onSecrets={vi.fn()} />);

        await user.click(await screen.findByText("Grok 登录"));

        await waitFor(() => {
            expect(screen.getByText(/access_denied/)).toBeInTheDocument();
        });
        expect(screen.getByText("重新登录")).toBeInTheDocument();
    });

    it("returns to login button after logout succeeds", async () => {
        const grok = mock_grok_api({
            login_status: {
                has_token: true,
                expires_at: "2026-12-31T00:00:00Z",
                can_refresh: true,
            },
        });
        const user = userEvent.setup();
        render(<DeviceLoginSection vendor="grok" instance_id={instance_id} onSecrets={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText("退出登录")).toBeInTheDocument();
        });
        await user.click(screen.getByText("退出登录"));

        await waitFor(() => {
            expect(grok.logout).toHaveBeenCalledWith(instance_id);
        });
        await waitFor(() => {
            expect(screen.getByText("Grok 登录")).toBeInTheDocument();
        });
    });

    it("stays logged in and shows error when logout fails", async () => {
        const grok = mock_grok_api({
            login_status: {
                has_token: true,
                expires_at: "2026-12-31T00:00:00Z",
                can_refresh: true,
            },
        });
        grok.logout.mockRejectedValueOnce(new Error("token locked"));
        const user = userEvent.setup();
        render(<DeviceLoginSection vendor="grok" instance_id={instance_id} onSecrets={vi.fn()} />);

        await waitFor(() => {
            expect(screen.getByText("退出登录")).toBeInTheDocument();
        });
        await user.click(screen.getByText("退出登录"));

        await waitFor(() => {
            expect(screen.getByText(/退出登录失败：token locked/)).toBeInTheDocument();
        });
        expect(screen.getByText("退出登录")).toBeInTheDocument();
    });
});

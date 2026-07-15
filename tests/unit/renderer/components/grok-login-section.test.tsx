import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GrokLoginSection } from "../../../../src/renderer/components/GrokLoginSection";
import type { GrokDeviceCodeStart, GrokLoginStatus } from "../../../../src/shared/types/ipc";

const instance_id = "grok-inst-1";

function mock_grok_api(overrides?: {
    login_status?: Partial<GrokLoginStatus>;
    login_start?: Partial<GrokDeviceCodeStart>;
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
        login_poll: vi.fn().mockResolvedValue({ saved: true }),
        login_status: vi.fn().mockResolvedValue(status),
        logout: vi.fn().mockResolvedValue({ logged_out: true }),
        refresh: vi.fn().mockResolvedValue({ success: true }),
    };
    (window as unknown as { usageboard: unknown }).usageboard = { grok };
    return grok;
}

describe("GrokLoginSection", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders Grok 登录 button when not logged in", async () => {
        mock_grok_api();
        render(<GrokLoginSection instance_id={instance_id} />);

        await waitFor(() => {
            expect(screen.getByText("Grok 登录")).toBeInTheDocument();
        });
    });

    it("shows device code and verification URL after clicking login", async () => {
        const grok = mock_grok_api();
        grok.login_poll.mockImplementation(() => new Promise(() => undefined)); // never resolves
        render(<GrokLoginSection instance_id={instance_id} />);

        const button = await screen.findByText("Grok 登录");
        await userEvent.click(button);

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

        expect(screen.getByText("https://auth.x.ai/device")).toBeInTheDocument();
        expect(screen.getByText("ABCD-EFGH")).toBeInTheDocument();
    });

    it("shows success after polling completes", async () => {
        mock_grok_api();
        render(<GrokLoginSection instance_id={instance_id} />);

        const button = await screen.findByText("Grok 登录");
        await userEvent.click(button);

        await waitFor(() => {
            expect(screen.getByText("登录成功")).toBeInTheDocument();
        });
    });

    it("shows error message when polling fails", async () => {
        const grok = mock_grok_api();
        grok.login_poll.mockRejectedValueOnce(new Error("access_denied: user denied"));
        render(<GrokLoginSection instance_id={instance_id} />);

        const button = await screen.findByText("Grok 登录");
        await userEvent.click(button);

        await waitFor(() => {
            expect(screen.getByTestId(`grok-login-error-${instance_id}`)).toHaveTextContent(
                "access_denied",
            );
        });
    });

    it("shows 退出登录 button when logged in", async () => {
        mock_grok_api({
            login_status: {
                has_token: true,
                expires_at: "2026-12-31T00:00:00Z",
                can_refresh: true,
            },
        });
        render(<GrokLoginSection instance_id={instance_id} />);

        await waitFor(() => {
            expect(screen.getByText("退出登录")).toBeInTheDocument();
        });
    });

    it("falls back to the verification URI when no complete URL is returned", async () => {
        const grok = mock_grok_api({
            login_start: { verification_uri_complete: null },
        });
        grok.login_poll.mockImplementation(() => new Promise(() => undefined));
        render(<GrokLoginSection instance_id={instance_id} />);

        await userEvent.click(await screen.findByText("Grok 登录"));

        const link = await screen.findByRole("link", { name: "https://auth.x.ai/device" });
        expect(link).toHaveAttribute("href", "https://auth.x.ai/device");
    });

    it("shows logout failure and keeps the logged-in state", async () => {
        const grok = mock_grok_api({
            login_status: {
                has_token: true,
                expires_at: "2026-12-31T00:00:00Z",
                can_refresh: true,
            },
        });
        grok.logout.mockRejectedValueOnce(new Error("vault unavailable"));
        render(<GrokLoginSection instance_id={instance_id} />);

        await userEvent.click(await screen.findByText("退出登录"));

        await waitFor(() => {
            expect(screen.getByTestId(`grok-login-error-${instance_id}`)).toHaveTextContent(
                "vault unavailable",
            );
        });
        expect(screen.getByText("退出登录")).toBeInTheDocument();
    });

    it("clicking logout calls logout API and updates status", async () => {
        const grok = mock_grok_api({
            login_status: {
                has_token: true,
                expires_at: "2026-12-31T00:00:00Z",
                can_refresh: true,
            },
        });
        render(<GrokLoginSection instance_id={instance_id} />);

        const logoutBtn = await screen.findByText("退出登录");
        await userEvent.click(logoutBtn);

        await waitFor(() => {
            expect(grok.logout).toHaveBeenCalledWith(instance_id);
        });
        // After logout, the login button should reappear
        await waitFor(() => {
            expect(screen.getByText("Grok 登录")).toBeInTheDocument();
        });
    });
});

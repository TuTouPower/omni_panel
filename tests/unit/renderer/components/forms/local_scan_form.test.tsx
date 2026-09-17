import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { LocalScanForm } from "../../../../../src/renderer/components/add_account/LocalScanForm";
import type { LocalScanResult } from "../../../../../src/shared/types/ipc";

describe("LocalScanForm", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("renders success state and account info when local auth is found", async () => {
        const scan_result: LocalScanResult = {
            found: true,
            path: "~/.codex/auth.json",
            details: {
                valid: true,
                email: "test-user@example.com",
                accountId: "acct-12345",
            },
        };

        const scanLocal = vi.fn().mockResolvedValue(scan_result);
        (window as unknown as { usageboard: unknown }).usageboard = {
            auth: { scanLocal },
        };

        const on_scan_result = vi.fn();
        render(<LocalScanForm vendor_id="codex" on_scan_result={on_scan_result} />);

        await waitFor(() => {
            expect(screen.getByText("已发现有效凭证")).toBeInTheDocument();
        });

        expect(screen.getByText("test-user@example.com")).toBeInTheDocument();
        expect(screen.getByText("acct-12345")).toBeInTheDocument();
        expect(screen.getAllByText("~/.codex/auth.json").length).toBeGreaterThanOrEqual(1);
        expect(on_scan_result).toHaveBeenCalledWith(scan_result);
    });

    it("renders not found state when scan returns found=false", async () => {
        const scan_result: LocalScanResult = {
            found: false,
            path: "~/.codex/auth.json",
        };

        const scanLocal = vi.fn().mockResolvedValue(scan_result);
        (window as unknown as { usageboard: unknown }).usageboard = {
            auth: { scanLocal },
        };

        render(<LocalScanForm vendor_id="codex" />);

        await waitFor(() => {
            expect(screen.getByText("未发现有效凭证")).toBeInTheDocument();
            expect(screen.getByText("未找到本地授权文件")).toBeInTheDocument();
        });
    });
});

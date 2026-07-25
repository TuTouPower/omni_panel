import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpaMgmtForm } from "../../../../../src/renderer/components/forms/CpaMgmtForm";
import type { AddAccountParams } from "../../../../../src/renderer/components/AddAccountDialog";

describe("CpaMgmtForm", () => {
    const on_save = vi
        .fn<(params: AddAccountParams) => Promise<void>>()
        .mockResolvedValue(undefined);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    function Wrapper({ default_endpoint }: { default_endpoint: string | undefined }) {
        const [account_name, set_account_name] = useState("");
        return (
            <CpaMgmtForm
                vendor_id="cpa"
                {...(default_endpoint !== undefined ? { default_endpoint } : {})}
                account_name={account_name}
                set_account_name={set_account_name}
                on_save={on_save}
            />
        );
    }

    function render_form(default_endpoint?: string) {
        return render(<Wrapper default_endpoint={default_endpoint} />);
    }

    it("renders key, endpoint and account name fields", () => {
        render_form();
        expect(screen.getByText("CPA 管理密钥")).toBeInTheDocument();
        expect(screen.getByText("管理端地址")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("例如：工作账号")).toBeInTheDocument();
        expect(screen.getByPlaceholderText<HTMLInputElement>("http://127.0.0.1:17863").value).toBe(
            "http://127.0.0.1:17863",
        );
    });

    it("uses provided default endpoint", () => {
        render_form("http://cpa.local:9000");
        expect(screen.getByPlaceholderText<HTMLInputElement>("http://127.0.0.1:17863").value).toBe(
            "http://cpa.local:9000",
        );
    });

    it("disables save until key is entered", async () => {
        const user = userEvent.setup();
        render_form();
        const save_btn = screen.getByText("添加账号").closest("button");
        expect(save_btn).toBeDisabled();

        await user.type(screen.getByPlaceholderText("cpa-…"), "secret");
        expect(save_btn).not.toBeDisabled();
    });

    it("calls on_save with secrets and endpoint overrides", async () => {
        const user = userEvent.setup();
        render_form();

        await user.type(screen.getByPlaceholderText("例如：工作账号"), "工作");
        await user.type(screen.getByPlaceholderText("cpa-…"), "cpa-secret");
        await user.clear(screen.getByPlaceholderText("http://127.0.0.1:17863"));
        await user.type(
            screen.getByPlaceholderText("http://127.0.0.1:17863"),
            "http://127.0.0.1:9000",
        );
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const call = on_save.mock.calls[0];
        if (!call) throw new Error("on_save was not called");
        const params = call[0];
        expect(params.vendor_id).toBe("cpa");
        expect(params.account_name).toBe("工作");
        expect(params.auth_method).toBe("cpa_mgmt");
        expect(params.secrets).toEqual({ cpa_mgmt_key: "cpa-secret" });
        expect(params.endpoint_overrides).toEqual({ default: "http://127.0.0.1:9000" });
    });

    it("falls back to default endpoint when endpoint is cleared", async () => {
        const user = userEvent.setup();
        render_form();

        await user.type(screen.getByPlaceholderText("cpa-…"), "cpa-secret");
        await user.clear(screen.getByPlaceholderText("http://127.0.0.1:17863"));
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const call = on_save.mock.calls[0];
        if (!call) throw new Error("on_save was not called");
        const params = call[0];
        expect(params.endpoint_overrides).toEqual({
            default: "http://127.0.0.1:17863",
        });
    });
});

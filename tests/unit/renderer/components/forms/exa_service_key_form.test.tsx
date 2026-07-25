import { describe, it, expect, vi, beforeEach } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExaServiceKeyForm } from "../../../../../src/renderer/components/forms/ExaServiceKeyForm";
import type { AddAccountParams } from "../../../../../src/renderer/components/AddAccountDialog";

describe("ExaServiceKeyForm", () => {
    const on_save = vi
        .fn<(params: AddAccountParams) => Promise<void>>()
        .mockResolvedValue(undefined);

    beforeEach(() => {
        vi.clearAllMocks();
    });

    function Wrapper() {
        const [account_name, set_account_name] = useState("");
        return (
            <ExaServiceKeyForm
                vendor_id="exa"
                secret_name="SERVICE_KEY"
                account_name={account_name}
                set_account_name={set_account_name}
                on_save={on_save}
            />
        );
    }

    function render_form() {
        return render(<Wrapper />);
    }

    it("renders service key, api key id and optional limit fields", () => {
        render_form();
        expect(screen.getByText("Service Key")).toBeInTheDocument();
        expect(screen.getByText("API Key ID")).toBeInTheDocument();
        expect(screen.getByText("限额")).toBeInTheDocument();
    });

    it("disables save until required fields are entered", async () => {
        const user = userEvent.setup();
        render_form();
        const save_btn = screen.getByText("添加账号").closest("button");
        expect(save_btn).toBeDisabled();

        await user.type(screen.getByPlaceholderText("exa-…"), "key");
        expect(save_btn).toBeDisabled();

        await user.type(screen.getByPlaceholderText("例如：my-key-id"), "id");
        expect(save_btn).not.toBeDisabled();
    });

    it("calls on_save with secrets and parameter values", async () => {
        const user = userEvent.setup();
        render_form();

        await user.type(screen.getByPlaceholderText("例如：工作账号"), "工作");
        await user.type(screen.getByPlaceholderText("exa-…"), "exa-secret");
        await user.type(screen.getByPlaceholderText("例如：my-key-id"), "key-id-1");
        await user.type(screen.getByPlaceholderText("例如：10000"), "5000");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const call = on_save.mock.calls[0];
        if (!call) throw new Error("on_save was not called");
        const params = call[0];
        expect(params.vendor_id).toBe("exa");
        expect(params.account_name).toBe("工作");
        expect(params.auth_method).toBe("apikey");
        expect(params.secrets).toEqual({ SERVICE_KEY: "exa-secret" });
        expect(params.parameter_values).toEqual({ API_KEY_ID: "key-id-1", LIMIT: "5000" });
    });

    it("omits LIMIT from parameter values when empty", async () => {
        const user = userEvent.setup();
        render_form();

        await user.type(screen.getByPlaceholderText("exa-…"), "exa-secret");
        await user.type(screen.getByPlaceholderText("例如：my-key-id"), "key-id-1");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const call = on_save.mock.calls[0];
        if (!call) throw new Error("on_save was not called");
        const params = call[0];
        expect(params.parameter_values).toEqual({ API_KEY_ID: "key-id-1" });
    });
});

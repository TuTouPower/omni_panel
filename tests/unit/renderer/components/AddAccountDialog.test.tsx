import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
    AddAccountDialog,
    generate_instance_id,
    type AddAccountParams,
} from "../../../../src/renderer/components/AddAccountDialog";

describe("AddAccountDialog 非安全上下文适配 (t527 AC-003)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("AC-003: crypto.randomUUID 不可用时 generate_instance_id 不抛异常并返回带厂商前缀的合法 id", () => {
        const orig_crypto = window.crypto;
        const fake_crypto = {
            getRandomValues: (arr: Uint8Array) => orig_crypto.getRandomValues(arr),
            randomUUID: undefined,
        };
        vi.stubGlobal("crypto", fake_crypto);

        expect(() => generate_instance_id("deepseek")).not.toThrow();
        const id = generate_instance_id("deepseek");
        expect(id).toMatch(
            /^deepseek-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
        );
    });

    it("AC-003: crypto.randomUUID 不可用时点击选择厂商不抛异常并进入认证步骤", () => {
        const orig_crypto = window.crypto;
        const fake_crypto = {
            getRandomValues: (arr: Uint8Array) => orig_crypto.getRandomValues(arr),
            randomUUID: undefined,
        };
        vi.stubGlobal("crypto", fake_crypto);

        const on_save = vi.fn().mockResolvedValue(undefined);
        const on_close = vi.fn();

        render(
            <AddAccountDialog
                plugin_infos={[]}
                catalog={[]}
                on_close={on_close}
                on_save={on_save}
            />,
        );

        // 点击 DeepSeek 服务
        const vendor_btn = screen.getByRole("button", { name: /DeepSeek/i });
        expect(() => fireEvent.click(vendor_btn)).not.toThrow();

        // 验证进入 auth 步骤，展示该服务标题
        expect(screen.getByText(/添加 DeepSeek 账号/)).toBeInTheDocument();
    });

    it("AC-001: 用户未填写备注时保存，传递的 account_name 留空（不使用厂商名兜底）", () => {
        const on_save = vi.fn().mockResolvedValue(undefined);
        const on_close = vi.fn();

        const { container } = render(
            <AddAccountDialog
                plugin_infos={[]}
                catalog={[]}
                on_close={on_close}
                on_save={on_save}
            />,
        );

        // 选厂商
        fireEvent.click(screen.getByRole("button", { name: /DeepSeek/i }));

        // 填写 api key（备注留空）
        const key_input = container.querySelector<HTMLInputElement>('input[name="api_key"]');
        if (!key_input) throw new Error("key_input not found");
        fireEvent.change(key_input, { target: { value: "sk-test" } });

        // 点击保存
        const save_btn = screen.getByRole("button", { name: "添加账号" });
        fireEvent.click(save_btn);

        expect(on_save).toHaveBeenCalled();
        const params = on_save.mock.calls[0]?.[0] as AddAccountParams | undefined;
        expect(params?.account_name).toBe("");
    });

    it("AC-002: 用户填写自定义备注时保存，传递该备注（trim 后）", () => {
        const on_save = vi.fn().mockResolvedValue(undefined);
        const on_close = vi.fn();

        const { container } = render(
            <AddAccountDialog
                plugin_infos={[]}
                catalog={[]}
                on_close={on_close}
                on_save={on_save}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /DeepSeek/i }));

        const remark_input = screen.getByPlaceholderText(/例如：工作账号/i);
        fireEvent.change(remark_input, { target: { value: "  工作主账号  " } });

        const key_input = container.querySelector<HTMLInputElement>('input[name="api_key"]');
        if (!key_input) throw new Error("key_input not found");
        fireEvent.change(key_input, { target: { value: "sk-test" } });

        const save_btn = screen.getByRole("button", { name: "添加账号" });
        fireEvent.click(save_btn);

        expect(on_save).toHaveBeenCalled();
        const params = on_save.mock.calls[0]?.[0] as AddAccountParams | undefined;
        expect(params?.account_name).toBe("工作主账号");
    });

    it("AC-003: 本地 CLI 授权扫描到邮箱时自动预填备注并在保存时传递该邮箱", async () => {
        const scan_result = {
            found: true,
            path: "~/.codex/auth.json",
            details: {
                valid: true,
                email: "dev@example.com",
            },
        };
        (window as unknown as { usageboard: unknown }).usageboard = {
            auth: { scanLocal: vi.fn().mockResolvedValue(scan_result) },
        };

        const on_save = vi.fn().mockResolvedValue(undefined);
        const on_close = vi.fn();

        const catalog = [
            {
                manifest_id: "codex",
                source: "local" as const,
                supported_providers: ["codex"],
                metadata: { name: "codex" },
            },
        ];

        render(
            <AddAccountDialog
                plugin_infos={[]}
                catalog={catalog}
                on_close={on_close}
                on_save={on_save}
            />,
        );

        fireEvent.click(screen.getByRole("button", { name: /Codex/i }));

        await waitFor(
            () => {
                expect(screen.getByText("已发现有效凭证")).toBeInTheDocument();
            },
            { timeout: 3000 },
        );

        const save_btn = screen.getByRole("button", { name: "导入账号" });
        fireEvent.click(save_btn);

        expect(on_save).toHaveBeenCalled();
        const params = on_save.mock.calls[0]?.[0] as AddAccountParams | undefined;
        expect(params?.account_name).toBe("dev@example.com");
    });
});

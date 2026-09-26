import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
    AddAccountDialog,
    generate_instance_id,
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
});

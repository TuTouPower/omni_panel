// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { App } from "../../../src/renderer/App";
import { install_web_usageboard } from "../../../src/web/usageboard-web";

describe("Web App 挂载与非安全上下文 (t527 AC-001)", () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        window.history.replaceState(null, "", "/#usage");
        document.documentElement.removeAttribute("data-web");
        document.documentElement.removeAttribute("data-theme");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("AC-001: 在 crypto.randomUUID 不可用时 install_web_usageboard + App 正常挂载到 DOM 并渲染", async () => {
        const orig_crypto = window.crypto;
        const fake_crypto = {
            getRandomValues: (arr: Uint8Array) => orig_crypto.getRandomValues(arr),
            randomUUID: undefined,
        };
        vi.stubGlobal("crypto", fake_crypto);

        expect(() => {
            install_web_usageboard();
        }).not.toThrow();

        // 挂载 App
        const { container, unmount } = render(<App />);
        expect(container).toBeDefined();

        // 验证有内容渲染（例如 popup / root 内容，而不是空）
        await waitFor(() => {
            expect(container.children.length).toBeGreaterThan(0);
        });

        unmount();
    });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";
import { base_config, install_settings_usageboard } from "./settings_view_test_utils";

let mock_loading = false;
let mock_error: string | null = null;
const mock_reload = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

vi.mock("../../../../src/renderer/hooks/use-config", () => ({
    use_config: () => ({
        config: base_config,
        hasSecrets: {},
        loading: mock_loading,
        error: mock_error,
        save: vi.fn(),
        saveSecrets: vi.fn(),
        duplicate: vi.fn(),
        reload: mock_reload,
    }),
}));

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
    apply_accent: () => undefined,
}));

describe("SettingsView titlebar unify (t494 AC-001/AC-002)", () => {
    beforeEach(() => {
        mock_loading = false;
        mock_error = null;
        mock_reload.mockClear();
        install_settings_usageboard(() => base_config);
    });

    it("loading 状态下标题栏面板切换与刷新可用 (AC-001/AC-002)", () => {
        const open_tray = vi.spyOn(window.usageboard.tray, "open_panel");
        mock_loading = true;
        render(<SettingsView />);

        // 断言切换按钮存在并可点击
        const usage_btn = screen.getByRole("button", { name: "Usage面板" });
        expect(usage_btn).toBeInTheDocument();
        act(() => {
            fireEvent.click(usage_btn);
        });
        expect(open_tray).toHaveBeenCalled();

        // 断言刷新按钮存在并可点击触发 reload
        const refresh_btn = screen.getByTitle("刷新当前面板");
        expect(refresh_btn).toBeInTheDocument();
        act(() => {
            fireEvent.click(refresh_btn);
        });
        expect(mock_reload).toHaveBeenCalled();
    });

    it("error 状态下标题栏面板切换与刷新可用 (AC-001/AC-002)", () => {
        const open_stats = vi.spyOn(window.usageboard.tokenStats, "open");
        mock_error = "无法读取配置文件";
        render(<SettingsView />);

        // 断言错误提示渲染
        expect(screen.getByText("无法读取配置文件")).toBeInTheDocument();

        // 断言切换按钮存在并可点击
        const agent_btn = screen.getByRole("button", { name: "Agent面板" });
        expect(agent_btn).toBeInTheDocument();
        act(() => {
            fireEvent.click(agent_btn);
        });
        expect(open_stats).toHaveBeenCalled();

        // 断言刷新按钮存在并可点击触发 reload
        const refresh_btn = screen.getByTitle("刷新当前面板");
        expect(refresh_btn).toBeInTheDocument();
        act(() => {
            fireEvent.click(refresh_btn);
        });
        expect(mock_reload).toHaveBeenCalled();
    });

    it("正常状态下标题栏渲染刷新按钮且点击触发 reload (AC-002)", () => {
        render(<SettingsView />);

        const refresh_btn = screen.getByTitle("刷新当前面板");
        expect(refresh_btn).toBeInTheDocument();
        act(() => {
            fireEvent.click(refresh_btn);
        });
        expect(mock_reload).toHaveBeenCalled();
    });
});

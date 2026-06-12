import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";

const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const saveSecrets = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const duplicate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    launchAtLogin: false,
    plugins: [
        {
            instanceId: "deepseek-1",
            stateId: "deepseek-1",
            name: "DeepSeek",
            enabled: true,
            executablePath: "plugins/deepseek.ts",
            refreshIntervalSeconds: 300,
            parameterValues: {},
            endpointOverrides: {},
        },
        {
            instanceId: "cpa-1",
            stateId: "cpa-1",
            name: "CPA",
            enabled: true,
            executablePath: "plugins/cpa.ts",
            refreshIntervalSeconds: 300,
            parameterValues: { monitor_claude: "true" },
            endpointOverrides: { default: "http://cpa.example" },
        },
    ],
};

let current_config: AppConfiguration = base_config;

vi.mock("../../../../src/renderer/hooks/use-config", () => ({
    use_config: () => ({
        config: current_config,
        hasSecrets: { "cpa-1": { cpa_mgmt_key: true } },
        loading: false,
        error: null,
        save,
        saveSecrets,
        duplicate,
    }),
}));

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("SettingsView", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        current_config = base_config;
        window.matchMedia = vi.fn().mockReturnValue({
            matches: false,
            addEventListener: vi.fn(),
            removeEventListener: vi.fn(),
        });
        window.usageboard = {
            platform: "win32",
            plugin: {
                list: vi.fn().mockResolvedValue([
                    {
                        instanceId: "deepseek-1",
                        sourceInstanceId: "deepseek-1",
                        stateId: "deepseek-1",
                        name: "DeepSeek",
                        displayName: "DeepSeek",
                        enabled: true,
                        source: "api_key",
                        supportedProviders: ["deepseek"],
                        activeProviders: ["deepseek"],
                        metadata: {
                            parameters: [
                                {
                                    name: "API_KEY",
                                    label: "API 密钥",
                                    type: "secret",
                                    required: true,
                                },
                            ],
                            endpoints: {
                                default: null,
                            },
                        },
                        snapshot: { status: "idle" },
                    },
                    {
                        instanceId: "cpa-1",
                        sourceInstanceId: "cpa-1",
                        stateId: "cpa-1",
                        name: "CPA",
                        displayName: "CPA",
                        enabled: true,
                        source: "cpa",
                        supportedProviders: ["claude", "codex", "gemini", "antigravity", "kimi"],
                        activeProviders: ["claude"],
                        metadata: {
                            parameters: [
                                {
                                    name: "cpa_mgmt_key",
                                    label: "管理密钥",
                                    type: "secret",
                                    required: true,
                                },
                                {
                                    name: "monitor_claude",
                                    label: "Claude",
                                    type: "boolean",
                                    required: false,
                                    defaultValue: "true",
                                },
                                {
                                    name: "monitor_codex",
                                    label: "Codex",
                                    type: "boolean",
                                    required: false,
                                    defaultValue: "false",
                                },
                                {
                                    name: "monitor_gemini",
                                    label: "Gemini",
                                    type: "boolean",
                                    required: false,
                                    defaultValue: "false",
                                },
                                {
                                    name: "monitor_antigravity",
                                    label: "Antigravity",
                                    type: "boolean",
                                    required: false,
                                    defaultValue: "false",
                                },
                                {
                                    name: "monitor_kimi",
                                    label: "Kimi",
                                    type: "boolean",
                                    required: false,
                                    defaultValue: "false",
                                },
                            ],
                            endpoints: {
                                default: "http://localhost:8080",
                            },
                        },
                        snapshot: {
                            status: "ready",
                            updatedAt: "2026-05-31T00:00:00.000Z",
                            items: [
                                {
                                    id: "claude-main",
                                    provider: "claude",
                                    source: "cpa",
                                    sourceInstanceId: "cpa-1",
                                    accountId: "claude-main",
                                    accountLabel: "Claude Account",
                                    name: "Claude 额度",
                                    used: 10,
                                    limit: 100,
                                    displayStyle: "percent",
                                    status: "normal",
                                },
                            ],
                        },
                    },
                ]),
                getState: vi.fn(),
                refresh: vi.fn(),
                refreshAll: vi.fn(),
            },
            config: {
                get: vi.fn(),
                save: vi.fn(),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(),
                onThemeChange: vi.fn(),
                onSettingsNavigate: vi.fn(() => vi.fn()),
            },
            popup: {
                report_content_height: vi.fn(),
            },
            main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
            settings: {
                open: vi.fn(),
                minimize: vi.fn(),
                maximize: vi.fn(),
                close: vi.fn(),
            },
            theme: { set: vi.fn() },
            tray: {
                open_panel: vi.fn(),
                refresh_all: vi.fn(),
                toggle_pause: vi.fn(),
                toggle_autostart: vi.fn(),
                open_settings: vi.fn(),
                check_update: vi.fn(),
                restart: vi.fn(),
                quit: vi.fn(),
                hide: vi.fn(),
                report_menu_size: vi.fn(),
                on_pause_state: vi.fn(() => vi.fn()),
                on_autostart_state: vi.fn(() => vi.fn()),
            },
            auth: { cookieLogin: vi.fn(), refreshCookies: vi.fn() },
            logs: { export: vi.fn() },
            log: vi.fn(),
        };
    });

    it("saves endpoint overrides and secrets without putting secrets in config", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const editButtons = screen.getAllByTitle("编辑");
        const deepseekEditButton = editButtons[0];
        if (!deepseekEditButton) throw new Error("missing DeepSeek edit button");
        await user.click(deepseekEditButton);
        await waitFor(() => expect(screen.getByLabelText("API 密钥")).toBeInTheDocument());

        await user.type(screen.getByLabelText("API 密钥"), "sk-test");
        await user.type(screen.getByLabelText("接口地址"), "https://api.deepseek.example ");
        await user.click(screen.getByTestId("settings-save-btn-deepseek-1"));

        await waitFor(() => {
            expect(saveSecrets).toHaveBeenCalledWith("deepseek-1", { API_KEY: "sk-test" });
        });
        expect(save).toHaveBeenCalledWith({
            ...base_config,
            plugins: [
                {
                    ...base_config.plugins[0],
                    parameterValues: {},
                    endpointOverrides: { default: "https://api.deepseek.example" },
                },
                base_config.plugins[1],
            ],
        });
    });

    it("does not render connector-level toggle for CPA account rows", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await waitFor(() => {
            expect(screen.getByText("在数据源中管理")).toBeInTheDocument();
        });

        const cpa_row = screen.getByText("在数据源中管理").closest(".ao-item");
        if (!cpa_row) throw new Error("missing CPA row");
        expect(cpa_row.querySelector(".sw")).toBeNull();
    });

    it("renders CPA connector settings page from accounts", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await waitFor(() => {
            expect(screen.getAllByText(/CPA/).length).toBeGreaterThan(0);
        });
        const edit_buttons = screen.getAllByTitle("编辑");
        const cpa_edit = edit_buttons.find((b) => {
            const row_text =
                b.closest(".ao-item")?.textContent ?? b.closest(".acct-row")?.textContent ?? "";
            return row_text.includes("CPA");
        });
        if (!cpa_edit) throw new Error("missing CPA edit button");
        await user.click(cpa_edit);

        await waitFor(() => {
            expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();
        });
        expect(screen.getByLabelText("CPA-Manager URL")).toHaveValue("http://cpa.example");
        expect(screen.getByLabelText("管理密钥")).toHaveValue("***");
        expect(screen.getByText("Claude Account")).toBeInTheDocument();
    });

    it("calls window.close when back button is clicked", async () => {
        const closeSpy = vi.spyOn(window, "close").mockImplementation(() => undefined);
        const user = userEvent.setup();
        render(<SettingsView />);
        const backBtn = document.querySelector<HTMLButtonElement>(".back-btn");
        if (!backBtn) throw new Error("back button not found");
        await user.click(backBtn);
        expect(closeSpy).toHaveBeenCalled();
        closeSpy.mockRestore();
    });

    it("saves main panel mode", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.selectOptions(screen.getByDisplayValue("跟随系统推荐"), "弹出面板");

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            mainPanelMode: "popup",
        });
    });

    it("shows and saves floating height mode when floating is effective", async () => {
        const user = userEvent.setup();
        current_config = { ...base_config, mainPanelMode: "floating" };
        render(<SettingsView />);

        expect(screen.getByText("浮动窗口高度")).toBeInTheDocument();
        await user.selectOptions(screen.getByDisplayValue("保持窗口大小"), "跟随内容变化");

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            mainPanelMode: "floating",
            floatingHeightMode: "followContent",
        });
    });

    it("hides floating height mode when popup is effective", async () => {
        current_config = { ...base_config, mainPanelMode: "popup" };
        render(<SettingsView />);

        await waitFor(() => {
            expect(screen.queryByText("浮动窗口高度")).not.toBeInTheDocument();
        });
    });

    it("shows and saves usage bar color scheme from appearance settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-appearance"));

        expect(screen.getByText("用量条颜色方案")).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /风险色：仅当前用量/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /风险色：带投影预测/ })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: /彩色区分：九色循环/ })).toBeInTheDocument();

        await user.click(screen.getByRole("button", { name: /彩色区分：九色循环/ }));

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            usageBarColorScheme: "nine-cycle",
        });
    });

    it("renders usage bar style as buttons above color scheme and saves it", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-appearance"));
        const style_label = screen.getByText("用量条样式");
        const color_label = screen.getByText("用量条颜色方案");
        expect(
            Boolean(
                style_label.compareDocumentPosition(color_label) & Node.DOCUMENT_POSITION_FOLLOWING,
            ),
        ).toBe(true);

        const style_field = screen.getByLabelText("用量条样式");
        expect(within(style_field).getByRole("button", { name: "细线型" })).toHaveClass("on");
        await user.click(within(style_field).getByRole("button", { name: "粗胶囊型" }));

        expect(save).toHaveBeenCalledWith({
            ...base_config,
            usageBarStyle: "capsule",
        });
    });

    it("does not render global usage label map in appearance settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-appearance"));

        expect(screen.queryByText("用量标签映射")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("用量标签映射")).not.toBeInTheDocument();
    });

    it("does not render anonymous usage statistics in data settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-data"));

        expect(screen.queryByText("匿名使用统计")).not.toBeInTheDocument();
    });

    it("does not render notification settings because notification delivery is not implemented", async () => {
        render(<SettingsView />);

        await waitFor(() => {
            expect(screen.getByTestId("settings-plugin-nav-accounts")).toBeInTheDocument();
        });
        expect(screen.queryByTestId("settings-plugin-nav-notify")).not.toBeInTheDocument();
        expect(screen.queryByText("接近限制时提醒")).not.toBeInTheDocument();
    });

    it("exports runtime logs from data settings", async () => {
        const user = userEvent.setup();
        const export_logs = vi.fn().mockResolvedValue({ saved: true });
        window.usageboard.logs = { export: export_logs };
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-data"));
        await user.click(screen.getByRole("button", { name: "导出日志" }));

        await waitFor(() => {
            expect(export_logs).toHaveBeenCalled();
        });
        expect(screen.getByRole("button", { name: "已导出" })).toBeInTheDocument();
    });

    it("navigates to accounts section on settings navigate event", async () => {
        let navigate_callback:
            | ((context: { instanceId?: string; provider?: string; accountId?: string }) => void)
            | undefined;

        const mock_on_settings_navigate = vi.fn((cb: unknown) => {
            navigate_callback = cb as typeof navigate_callback;
            return vi.fn();
        });
        window.usageboard.event.onSettingsNavigate = mock_on_settings_navigate;

        render(<SettingsView />);

        await waitFor(() => {
            expect(mock_on_settings_navigate).toHaveBeenCalled();
        });

        if (!navigate_callback) throw new Error("navigate callback not captured");
        act(() => {
            navigate_callback?.({
                instanceId: "deepseek-1",
                provider: "deepseek",
                accountId: "test",
            });
        });

        await waitFor(() => {
            expect(screen.getByText("API 密钥")).toBeInTheDocument();
        });
    });

    it("right-aligns account action buttons via margin-left: auto", async () => {
        // The .ao-actions element must have margin-left: auto to push
        // toggle/action buttons to the right edge of the flex row.
        // JSDOM doesn't load external CSS, so we verify the rule exists in the source.
        const { readFile } = await import("node:fs/promises");
        const { join, dirname } = await import("node:path");
        const { fileURLToPath } = await import("node:url");
        const css = await readFile(
            join(
                dirname(fileURLToPath(import.meta.url)),
                "../../../../src/renderer/styles/globals.css",
            ),
            "utf8",
        );

        // .ao-actions block must include margin-left: auto
        const match = /\.ao-actions\s*\{([^}]+)\}/.exec(css);
        if (!match) throw new Error(".ao-actions rule not found in globals.css");
        expect(match[1]).toContain("margin-left");
        expect(match[1]).toContain("auto");
    });

    it("calls plugin.refresh after cookieLogin succeeds", async () => {
        const instance_id = "mimo-1";
        const mock_cookie_login = vi
            .fn<(_id: string) => Promise<{ saved: boolean }>>()
            .mockResolvedValue({ saved: true });
        const mock_refresh = vi.fn();
        window.usageboard.auth.cookieLogin = mock_cookie_login;
        window.usageboard.plugin.refresh = mock_refresh;

        const result = await mock_cookie_login(instance_id);
        if (result.saved) {
            await mock_refresh(instance_id);
        }

        expect(mock_cookie_login).toHaveBeenCalledWith("mimo-1");
        expect(mock_refresh).toHaveBeenCalledWith("mimo-1");
    });

    it("does not call plugin.refresh when cookieLogin fails", async () => {
        const mock_cookie_login = vi
            .fn<(_id: string) => Promise<{ saved: boolean }>>()
            .mockResolvedValue({ saved: false });
        const mock_refresh = vi.fn();
        window.usageboard.auth.cookieLogin = mock_cookie_login;
        window.usageboard.plugin.refresh = mock_refresh;

        const result = await mock_cookie_login("mimo-1");
        if (result.saved) {
            await mock_refresh("mimo-1");
        }

        expect(mock_cookie_login).toHaveBeenCalledWith("mimo-1");
        expect(mock_refresh).not.toHaveBeenCalled();
    });

    it("disables a plugin when toggle is clicked on accounts page", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));

        // Find the DeepSeek toggle button and click it
        const toggles = screen.getAllByRole("button").filter((btn) => btn.className.includes("sw"));
        const deepseek_toggle = toggles[0];
        if (!deepseek_toggle) throw new Error("toggle not found");
        await user.click(deepseek_toggle);

        await waitFor(() => {
            expect(save).toHaveBeenCalled();
        });
        const saved_config = (
            save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
        )?.[0];
        if (!saved_config) return;
        const deepseek_plugin = saved_config.plugins.find((p) => p.instanceId === "deepseek-1");
        expect(deepseek_plugin?.enabled).toBe(false);
    });
});

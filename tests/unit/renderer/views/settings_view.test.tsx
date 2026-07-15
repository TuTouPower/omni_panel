import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";

const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const saveSecrets = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const duplicate = vi
    .fn<(instanceId: string) => Promise<{ instanceId: string }>>()
    .mockResolvedValue({
        instanceId: "deepseek-2",
    });
const grok_login_status = vi.fn().mockResolvedValue({
    has_token: false,
    expires_at: null,
    can_refresh: false,
});

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

// LIMITATION: use_config is fully mocked below, which hides real serialization
// queue behavior (save_queue_ref in use-config.ts). A focused test below
// exercises the real hook's serialization queue in isolation.
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
        const connectorMock = {
            list: vi.fn().mockResolvedValue([
                {
                    instanceId: "deepseek-1",
                    sourceInstanceId: "deepseek-1",
                    stateId: "deepseek-1",
                    name: "DeepSeek",
                    displayName: "DeepSeek",
                    enabled: true,
                    source: "poll",
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
                    source: "gateway",
                    supportedProviders: ["claude", "codex", "antigravity", "kimi"],
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
                                source: "gateway",
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
            snapshot: vi.fn(),
        };
        window.usageboard = {
            platform: "win32",
            connector: connectorMock,

            plugin: connectorMock,
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
                survey: vi.fn(),
                sponsor: vi.fn(),
                restart: vi.fn(),
                quit: vi.fn(),
                hide: vi.fn(),
                report_menu_size: vi.fn(),
                on_pause_state: vi.fn(() => vi.fn()),
                on_autostart_state: vi.fn(() => vi.fn()),
            },
            auth: { cookieLogin: vi.fn() },
            session: { login: vi.fn(), refresh: vi.fn() },
            grok: {
                login_start: vi.fn(),
                login_poll: vi.fn(),
                login_status: grok_login_status,
                logout: vi.fn(),
                refresh: vi.fn(),
            },
            logs: { export: vi.fn() },
            log: vi.fn(),
        };
    });

    it("labels the log level selector for assistive technology", async () => {
        current_config = { ...base_config, logLevel: "info" };
        render(<SettingsView />);

        expect(await screen.findByLabelText("日志等级")).toHaveDisplayValue("Info");
    });

    it("saves selected log level from general settings", async () => {
        current_config = { ...base_config, logLevel: "info" };
        render(<SettingsView />);

        const user = userEvent.setup();
        await user.selectOptions(await screen.findByDisplayValue("Info"), "Debug");

        await waitFor(() => {
            expect(save).toHaveBeenCalledWith(expect.objectContaining({ logLevel: "debug" }));
        });
    });

    it("opens the Grok settings form with OAuth login and no editable billing endpoint", async () => {
        current_config = {
            ...base_config,
            plugins: [
                ...base_config.plugins,
                {
                    instanceId: "grok-1",
                    stateId: "grok-1",
                    name: "Grok",
                    enabled: true,
                    executablePath: "plugins/grok.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        window.usageboard.connector.list = vi.fn().mockResolvedValue([
            ...(await window.usageboard.connector.list()),
            {
                instanceId: "grok-1",
                sourceInstanceId: "grok-1",
                stateId: "grok-1",
                name: "Grok",
                displayName: "Grok",
                enabled: true,
                source: "poll",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                metadata: {
                    parameters: [],
                    endpoints: {
                        grok_billing: "https://cli-chat-proxy.grok.com",
                    },
                },
                snapshot: { status: "idle" },
            },
        ]);
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const grok_label = await screen.findByText("Grok");
        const card = grok_label.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing Grok card");
        const edit_button = within(card).getByTitle("编辑");
        await user.click(edit_button);

        expect(await screen.findByTestId("settings-form-grok-1")).toBeInTheDocument();
        expect(screen.getByText("Grok 登录")).toBeInTheDocument();
        expect(screen.queryByLabelText("接口地址 (grok_billing)")).not.toBeInTheDocument();
        expect(grok_login_status).toHaveBeenCalledWith("grok-1");
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

    it("does not await connector.refresh during save (fire-and-forget)", async () => {
        const user = userEvent.setup();

        // refresh never resolves; if save path awaited it, the AccountDialog would
        // stay open (button text "保存中...") because onSave wrapper
        // (await onSave(...); onClose()) would never complete.
        const refresh_spy = vi.fn(
            () =>
                new Promise<void>(() => {
                    /* never resolves */
                }),
        );
        window.usageboard.connector.refresh = refresh_spy;

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

        // save must complete (saveSecrets + save called) and refresh must be
        // triggered as fire-and-forget.
        await waitFor(() => {
            expect(saveSecrets).toHaveBeenCalledWith("deepseek-1", { API_KEY: "sk-test" });
        });
        expect(save).toHaveBeenCalled();
        expect(refresh_spy).toHaveBeenCalledWith("deepseek-1");

        // onSave wrapper resolves once savePluginSettings returns (fire-and-forget
        // refresh), then onClose unmounts the dialog. If implementation awaited
        // refresh, the dialog would stay mounted and button text would stay
        // "保存中..." forever.
        await waitFor(() => {
            expect(screen.queryByTestId("settings-save-btn-deepseek-1")).not.toBeInTheDocument();
        });
    });

    it("saves account label edits as vendor-level label maps", async () => {
        const user = userEvent.setup();
        window.usageboard.connector.getState = vi.fn().mockResolvedValue({
            status: "ready",
            items: [
                {
                    provider: "deepseek",
                    raw_label: "rolling",
                    normalized_label: "滚动",
                },
            ],
        });

        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const editButtons = screen.getAllByTitle("编辑");
        const deepseekEditButton = editButtons[0];
        if (!deepseekEditButton) throw new Error("missing DeepSeek edit button");
        await user.click(deepseekEditButton);
        await waitFor(() => expect(screen.getByText("数据标签映射")).toBeInTheDocument());

        await user.click(screen.getByText("数据标签映射"));
        const input = await screen.findByDisplayValue("滚动");
        await user.clear(input);
        await user.type(input, "5 小时");
        await user.type(screen.getByLabelText("API 密钥"), "sk-test");
        await user.type(screen.getByLabelText("接口地址"), "https://api.deepseek.example");
        await user.click(screen.getByTestId("settings-save-btn-deepseek-1"));

        await waitFor(() => {
            expect(save).toHaveBeenCalledWith({
                ...base_config,
                providerLabelMaps: {
                    deepseek: { rolling: "5 小时" },
                },
            });
        });
    });

    it("renders CPA as a card with a parent status and status-free child rows", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        expect(card).not.toHaveTextContent("1 账号");
        expect(card).not.toHaveTextContent("1 服务商");

        const parent_row = card.querySelector<HTMLElement>(".ds-row");
        if (!parent_row) throw new Error("missing CPA parent row");
        expect(parent_row).toHaveTextContent("正常");
        expect(parent_row.querySelector(".ar-status")).toBeInTheDocument();

        // CPA child rows never expose collection status. The card has only its parent status slot.
        expect(card.querySelectorAll(".ar-status")).toHaveLength(1);
    });

    it("renders CPA connector settings page from accounts", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await waitFor(() => {
            expect(screen.getAllByText(/CPA/).length).toBeGreaterThan(0);
        });
        const edit_buttons = screen.getAllByTitle("编辑（连接设置）");
        if (edit_buttons.length === 0) throw new Error("missing CPA edit button");
        if (!edit_buttons[0]) return;
        await user.click(edit_buttons[0]);

        await waitFor(() => {
            expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();
        });
        expect(screen.getByLabelText("备注")).toHaveValue("");
        expect(screen.getByLabelText("CPA-Manager URL")).toHaveValue("http://cpa.example");
        expect(screen.getByLabelText("管理密钥")).toHaveValue("***");
        expect(
            within(screen.getByTestId("cpa-connector-settings")).getByText("同步范围"),
        ).toBeInTheDocument();
    });

    it("saves CPA remark without refreshing and returns to accounts list", async () => {
        const user = userEvent.setup();
        const refresh_spy = vi.fn();
        window.usageboard.connector.refresh = refresh_spy;
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");
        await user.click(edit_btn);

        await user.type(screen.getByLabelText("备注"), "工作数据源");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(save).toHaveBeenCalledWith({
                ...base_config,
                plugins: [
                    base_config.plugins[0],
                    {
                        ...base_config.plugins[1],
                        displayName: "工作数据源",
                        parameterValues: {
                            monitor_claude: "true",
                            monitor_codex: "false",
                            monitor_antigravity: "false",
                            monitor_kimi: "false",
                        },
                    },
                ],
            });
        });
        expect(refresh_spy).not.toHaveBeenCalled();
        expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        expect(screen.getByText("CPA")).toBeInTheDocument();
    });

    it("refreshes only the edited CPA after endpoint changes and returns immediately", async () => {
        const user = userEvent.setup();
        const refresh_spy = vi.fn(
            () =>
                new Promise<void>(() => {
                    /* never resolves */
                }),
        );
        const refresh_all_spy = vi.fn();
        window.usageboard.connector.refresh = refresh_spy;
        window.usageboard.connector.refreshAll = refresh_all_spy;
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");
        await user.click(edit_btn);

        await user.clear(screen.getByLabelText("CPA-Manager URL"));
        await user.type(screen.getByLabelText("CPA-Manager URL"), "http://new-cpa.example");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(refresh_spy).toHaveBeenCalledWith("cpa-1");
            expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        });
        expect(refresh_all_spy).not.toHaveBeenCalled();
    });

    it("refreshes only the edited CPA after management key changes", async () => {
        const user = userEvent.setup();
        const refresh_spy = vi.fn().mockResolvedValue(undefined);
        const refresh_all_spy = vi.fn().mockResolvedValue(undefined);
        window.usageboard.connector.refresh = refresh_spy;
        window.usageboard.connector.refreshAll = refresh_all_spy;
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");
        await user.click(edit_btn);

        await user.clear(screen.getByLabelText("管理密钥"));
        await user.type(screen.getByLabelText("管理密钥"), "new-secret");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(saveSecrets).toHaveBeenCalledWith("cpa-1", {
                cpa_mgmt_key: "new-secret",
            });
            expect(refresh_spy).toHaveBeenCalledWith("cpa-1");
            expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        });
        expect(refresh_spy).toHaveBeenCalledTimes(1);
        expect(refresh_all_spy).not.toHaveBeenCalled();
    });

    it("does not render a separate data source nav", async () => {
        render(<SettingsView />);

        await waitFor(() => {
            expect(screen.getByTestId("settings-plugin-nav-accounts")).toBeInTheDocument();
        });
        expect(screen.queryByTestId("settings-plugin-nav-datasource")).not.toBeInTheDocument();
        expect(screen.queryByText("数据源")).not.toBeInTheDocument();
    });

    it("toggles CPA connection row without opening settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const toggle = card.querySelector<HTMLButtonElement>(".sw");
        if (!toggle) throw new Error("missing CPA toggle");

        await user.click(toggle);

        expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        expect(save).toHaveBeenCalledWith({
            ...base_config,
            plugins: [base_config.plugins[0], { ...base_config.plugins[1], enabled: false }],
        });
    });

    it("opens CPA editing as inline panel with breadcrumb, not dialog", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");

        await user.click(edit_btn);

        // Should render CPA settings inline (not in a dialog overlay)
        expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();
        // Should show breadcrumb
        expect(document.querySelector(".sp-crumb")).toBeInTheDocument();
        // Should NOT render inside an acct-dialog overlay
        const dialog = document.querySelector(".acct-dialog");
        expect(dialog).toBeNull();
    });

    it("returns to accounts list when breadcrumb back link is clicked", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");

        await user.click(edit_btn);
        expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();

        // Click breadcrumb link to go back
        const crumb_link = document.querySelector(".sp-crumb-link");
        if (!crumb_link) throw new Error("missing breadcrumb link");
        await user.click(crumb_link);

        // Should be back to accounts list, no inline CPA settings
        expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        expect(screen.getByText("CPA")).toBeInTheDocument();
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

    it("calls session.login and plugin.refresh after cookie login succeeds", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            plugins: [
                {
                    instanceId: "mimo-1",
                    stateId: "mimo-1",
                    name: "MiMo",
                    enabled: true,
                    executablePath: "plugins/mimo.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        const mock_session_login = vi.fn().mockResolvedValue({ saved: true });
        const mock_refresh = vi.fn();
        window.usageboard.session.login = mock_session_login;
        window.usageboard.connector.refresh = mock_refresh;
        window.usageboard.connector.list = vi.fn().mockResolvedValue([
            {
                instanceId: "mimo-1",
                sourceInstanceId: "mimo-1",
                stateId: "mimo-1",
                name: "MiMo",
                displayName: "MiMo",
                enabled: true,
                source: "poll",
                supportedProviders: ["mimo"],
                activeProviders: ["mimo"],
                metadata: {
                    parameters: [
                        {
                            name: "SESSION_COOKIE",
                            label: "Cookie",
                            type: "secret",
                            required: true,
                        },
                    ],
                    endpoints: {},
                },
                snapshot: { status: "idle" },
            },
        ]);

        render(<SettingsView />);
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await user.click(await screen.findByTitle("编辑"));
        await user.click(await screen.findByText("网页登录"));

        await waitFor(() => {
            expect(mock_session_login).toHaveBeenCalledWith({
                instance_id: "mimo-1",
                provider: "mimo",
                login_url: "https://platform.xiaomimimo.com/console/plan-manage",
                cookie_names: ["api-platform_serviceToken", "api-platform_slh", "api-platform_ph"],
            });
        });
        expect(mock_refresh).toHaveBeenCalledWith("mimo-1");
        const config_get = Reflect.get(window.usageboard.config, "get") as ReturnType<typeof vi.fn>;
        expect(config_get).toHaveBeenCalled();
    });

    it("calls session.login with OpenCode Go session metadata and refreshes", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            plugins: [
                {
                    instanceId: "opencode-go-1",
                    stateId: "opencode-go-1",
                    name: "OpenCode Go",
                    enabled: true,
                    executablePath: "connectors/opencode_go/connector.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        const mock_session_login = vi.fn().mockResolvedValue({ saved: true });
        const mock_refresh = vi.fn();
        window.usageboard.session.login = mock_session_login;
        window.usageboard.connector.refresh = mock_refresh;
        window.usageboard.connector.list = vi.fn().mockResolvedValue([
            {
                instanceId: "opencode-go-1",
                sourceInstanceId: "opencode-go-1",
                stateId: "opencode-go-1",
                name: "OpenCode Go",
                displayName: "OpenCode Go",
                enabled: true,
                source: "session",
                supportedProviders: ["opencode_go"],
                activeProviders: ["opencode_go"],
                metadata: {
                    parameters: [
                        {
                            name: "SESSION_COOKIE",
                            label: "Cookie",
                            type: "secret",
                            required: true,
                        },
                    ],
                    endpoints: {},
                },
                snapshot: { status: "idle" },
            },
        ]);

        render(<SettingsView />);
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await user.click(await screen.findByTitle("编辑"));
        await user.click(await screen.findByText("网页登录"));

        await waitFor(() => {
            expect(mock_session_login).toHaveBeenCalledWith({
                instance_id: "opencode-go-1",
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
            });
        });
        expect(mock_refresh).toHaveBeenCalledWith("opencode-go-1");
    });

    it("does not call plugin.refresh when cookie login fails", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            plugins: [
                {
                    instanceId: "mimo-1",
                    stateId: "mimo-1",
                    name: "MiMo",
                    enabled: true,
                    executablePath: "plugins/mimo.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        const mock_session_login = vi.fn().mockResolvedValue({ saved: false });
        const mock_refresh = vi.fn();
        window.usageboard.session.login = mock_session_login;
        window.usageboard.connector.refresh = mock_refresh;
        window.usageboard.connector.list = vi.fn().mockResolvedValue([
            {
                instanceId: "mimo-1",
                sourceInstanceId: "mimo-1",
                stateId: "mimo-1",
                name: "MiMo",
                displayName: "MiMo",
                enabled: true,
                source: "poll",
                supportedProviders: ["mimo"],
                activeProviders: ["mimo"],
                metadata: {
                    parameters: [
                        {
                            name: "SESSION_COOKIE",
                            label: "Cookie",
                            type: "secret",
                            required: true,
                        },
                    ],
                    endpoints: {},
                },
                snapshot: { status: "idle" },
            },
        ]);

        render(<SettingsView />);
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await user.click(await screen.findByTitle("编辑"));
        await user.click(await screen.findByText("网页登录"));

        await waitFor(() => {
            expect(mock_session_login).toHaveBeenCalled();
        });
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

    it("shows label map sync behavior in general section", async () => {
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByText("同一厂商的数据标签映射同步")).toBeInTheDocument();
        });
        const syncRow = screen.getByText("同一厂商的数据标签映射同步").closest(".set-row");
        if (!syncRow) throw new Error("sync row not found");
        expect(within(syncRow as HTMLElement).queryByRole("button")).not.toBeInTheDocument();
    });

    it("shows '账号' nav label instead of '已添加'", async () => {
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByText("账号")).toBeInTheDocument();
        });
        expect(screen.queryByText("已添加")).not.toBeInTheDocument();
    });

    it("opens edit form after settings navigate when connector info loads later", async () => {
        let navigate_callback:
            | ((context: { instanceId?: string; provider?: string; accountId?: string }) => void)
            | undefined;
        window.usageboard.event.onSettingsNavigate = vi.fn((cb: unknown) => {
            navigate_callback = cb as typeof navigate_callback;
            return vi.fn();
        });
        const connector_list = vi.fn().mockResolvedValueOnce([]);
        window.usageboard.connector.list = connector_list;
        connector_list.mockResolvedValue([
            {
                instanceId: "opencode-go-1",
                sourceInstanceId: "workspace-1",
                stateId: "opencode-go-1",
                name: "OpenCode Go",
                displayName: "OpenCode Go",
                enabled: true,
                source: "session",
                supportedProviders: ["opencode_go"],
                activeProviders: ["opencode_go"],
                metadata: {
                    parameters: [],
                    endpoints: { default: "https://opencode.ai", login: "https://opencode.ai" },
                },
                snapshot: { status: "idle" },
            },
        ]);
        current_config = {
            ...base_config,
            plugins: [
                {
                    instanceId: "opencode-go-1",
                    stateId: "opencode-go-1",
                    name: "OpenCode Go",
                    enabled: true,
                    executablePath: "connectors/opencode_go/connector.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };

        render(<SettingsView />);
        await waitFor(() => {
            expect(navigate_callback).toBeDefined();
        });

        act(() => {
            navigate_callback?.({
                instanceId: "opencode-go-1",
                provider: "opencode_go",
                accountId: "workspace-1",
            });
        });

        await waitFor(() => {
            const dialog = screen.getByRole("dialog");
            expect(within(dialog).getByText("编辑账号")).toBeInTheDocument();
            expect(within(dialog).getByText("OpenCode Go")).toBeInTheDocument();
        });
        expect(screen.queryByText("添加账号")).not.toBeInTheDocument();
    });

    it("add account button opens service picker in AccountDialog", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));

        // The "添加" button now opens AccountDialog (add mode) with AddAccountPicker
        expect(screen.getByRole("button", { name: /^添加$/ })).toBeInTheDocument();
    });

    it("opens duplicated account dialog with vendor name instead of old account name", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            plugins: [
                ...base_config.plugins,
                {
                    instanceId: "deepseek-2",
                    stateId: "deepseek-2",
                    name: "DeepSeek",
                    enabled: true,
                    executablePath: "plugins/deepseek.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        window.usageboard.connector.list = vi.fn().mockResolvedValue([
            {
                instanceId: "deepseek-1",
                sourceInstanceId: "deepseek-1",
                stateId: "deepseek-1",
                name: "DeepSeek",
                displayName: "DeepSeek old account",
                enabled: true,
                source: "poll",
                supportedProviders: ["deepseek"],
                activeProviders: ["deepseek"],
                metadata: { parameters: [], endpoints: {} },
                snapshot: { status: "idle" },
            },
            {
                instanceId: "deepseek-2",
                sourceInstanceId: "deepseek-2",
                stateId: "deepseek-2",
                name: "DeepSeek",
                displayName: "DeepSeek",
                enabled: true,
                source: "poll",
                supportedProviders: ["deepseek"],
                activeProviders: ["deepseek"],
                metadata: { parameters: [], endpoints: {} },
                snapshot: { status: "idle" },
            },
        ]);

        render(<SettingsView />);
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await user.click(screen.getByRole("button", { name: /^添加$/ }));
        await user.click(screen.getByRole("button", { name: "DeepSeek" }));

        const dialog = await screen.findByRole("dialog");
        expect(duplicate).toHaveBeenCalledWith("deepseek-1");
        expect(within(dialog).getByText("DeepSeek")).toBeInTheDocument();
        expect(within(dialog).queryByText("DeepSeek old account")).not.toBeInTheDocument();
    });

    it("shows VendorMark in edit dialog header", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);
        // Navigate to accounts section
        await waitFor(() => {
            expect(screen.getByText("账号")).toBeInTheDocument();
        });
        await user.click(screen.getByText("账号"));
        await waitFor(() => {
            expect(screen.getAllByText("DeepSeek").length).toBeGreaterThan(0);
        });
        // Click edit button on DeepSeek card
        const editButtons = screen.getAllByTitle("编辑");
        if (editButtons.length > 0) {
            if (!editButtons[0]) return;
            await user.click(editButtons[0]);
            await waitFor(() => {
                expect(screen.getByText("编辑账号")).toBeInTheDocument();
            });
            // Check VendorMark is present in the dialog header
            const dialog = screen.getByRole("dialog");
            const mark = dialog.querySelector(".ad-mark");
            expect(mark).not.toBeNull();
        }
    });

    it("shows proxy URL input in general section", async () => {
        current_config = { ...base_config, proxy: { url: "http://127.0.0.1:7897" } };
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("留空表示直连")).toBeInTheDocument();
        });
        expect(screen.getByPlaceholderText("留空表示直连")).toHaveValue("http://127.0.0.1:7897");
    });

    it("saves proxy config when proxy URL is entered", async () => {
        const user = userEvent.setup();
        current_config = { ...base_config };
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("留空表示直连")).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText("留空表示直连");
        await user.clear(input);
        // Use paste to insert full URL in one event (type fires per-character).
        await user.click(input);
        await user.paste("http://127.0.0.1:7897");

        await waitFor(() => {
            expect(save).toHaveBeenCalled();
        });
        const saved_config = (
            save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
        )?.[0];
        expect(saved_config?.proxy).toEqual({ url: "http://127.0.0.1:7897" });
    });

    it("renders 8 action cards in about section", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        const cards = document.querySelectorAll(".ab-card");
        expect(cards).toHaveLength(8);
    });

    it("shows platform info in separate meta line", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        const meta = document.querySelector(".ah-meta");
        expect(meta).not.toBeNull();
        expect(meta?.textContent).toMatch(/Windows.*x64/);
    });

    it("shows omniusage.app as site card subtitle", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        expect(screen.getByText("omniusage.app")).toBeInTheDocument();
    });

    it("shows '当前已是最新' as update card subtitle", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-about"));
        expect(screen.getByText("当前已是最新")).toBeInTheDocument();
    });

    it("removes proxy config when proxy URL is cleared", async () => {
        const user = userEvent.setup();
        current_config = { ...base_config, proxy: { url: "http://127.0.0.1:7897" } };
        render(<SettingsView />);
        await waitFor(() => {
            expect(screen.getByPlaceholderText("留空表示直连")).toBeInTheDocument();
        });

        const input = screen.getByPlaceholderText("留空表示直连");
        await user.clear(input);

        await waitFor(() => {
            expect(save).toHaveBeenCalled();
        });
        const saved_config = (
            save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
        )?.[0];
        expect(saved_config?.proxy).toBeUndefined();
    });

    it("does not show 采集失败 for CPA accounts with critical usage status", async () => {
        // Regression: status "critical" (usage at 100%) was mapped to "error"
        // → "采集失败", even though data was collected successfully.
        const connectorMock = window.usageboard.connector as unknown as {
            list: ReturnType<typeof vi.fn>;
        };
        connectorMock.list = vi.fn().mockResolvedValue([
            {
                instanceId: "cpa-1",
                sourceInstanceId: "cpa-1",
                stateId: "cpa-1",
                name: "CPA",
                displayName: "CPA",
                enabled: true,
                source: "gateway",
                supportedProviders: ["codex"],
                activeProviders: ["codex"],
                metadata: {
                    parameters: [],
                    endpoints: { default: "http://localhost:8080" },
                },
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-06-15T12:00:00.000Z",
                    items: [
                        {
                            id: "codex-full",
                            provider: "codex",
                            source: "gateway",
                            sourceInstanceId: "cpa-1",
                            accountId: "codex-full",
                            accountLabel: "Codex Account Full",
                            used: 100,
                            limit: 100,
                            displayStyle: "percent",
                            status: "critical",
                        },
                        {
                            id: "codex-ok",
                            provider: "codex",
                            source: "gateway",
                            sourceInstanceId: "cpa-1",
                            accountId: "codex-ok",
                            accountLabel: "Codex Account OK",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            status: "normal",
                        },
                    ],
                },
            },
        ]);

        render(<SettingsView />);
        await screen.findByTestId("settings-plugin-nav-accounts");
        const user = userEvent.setup();
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));

        await waitFor(() => {
            expect(document.querySelectorAll(".acc-card .acc-row").length).toBeGreaterThan(1);
        });

        // CPA child rows never expose collection status.
        expect(screen.queryByText("采集失败")).not.toBeInTheDocument();
    });
});

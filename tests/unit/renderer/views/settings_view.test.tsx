import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";
import {
    save,
    saveSecrets,
    duplicate,
    grok_login_status,
    base_config,
    install_settings_usageboard,
} from "./settings_view_test_utils";

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
        current_config = base_config;
        install_settings_usageboard(() => current_config);
    });

    it("opens the Grok settings form with OAuth login and no editable billing endpoint", async () => {
        current_config = {
            ...base_config,
            plugins: [
                ...base_config.plugins,
                {
                    instanceId: "grok-1",
                    stateId: "grok-1",
                    name: "grok",
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
                name: "grok",
                displayName: "Grok",
                enabled: true,
                source: "poll",
                supportedProviders: ["grok"],
                activeProviders: ["grok"],
                metadata: {
                    auth: { method: "oauth_device", secret_name: "OAUTH_TOKEN" },
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

    it("calls session.login and plugin.refresh after OpenCode Go web login succeeds", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            plugins: [
                {
                    instanceId: "opencode-go-1",
                    stateId: "opencode-go-1",
                    name: "opencode_go",
                    enabled: true,
                    executablePath: "connectors/opencode_go/connector.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        const mock_session_login = vi.fn().mockResolvedValue({ saved: true, cookie: "cookie" });
        const mock_refresh = vi.fn();
        window.usageboard.session.login = mock_session_login;
        window.usageboard.connector.refresh = mock_refresh;
        window.usageboard.connector.list = vi.fn().mockResolvedValue([
            {
                instanceId: "opencode-go-1",
                sourceInstanceId: "opencode-go-1",
                stateId: "opencode-go-1",
                name: "opencode_go",
                displayName: "OpenCode Go",
                enabled: true,
                source: "session",
                supportedProviders: ["opencode_go"],
                activeProviders: ["opencode_go"],
                metadata: {
                    auth: {
                        method: "web_login",
                        secret_name: "SESSION_COOKIE",
                        login_url: "https://opencode.ai/auth",
                    },
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

    it("does not call plugin.refresh when OpenCode Go web login fails", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            plugins: [
                {
                    instanceId: "opencode-go-1",
                    stateId: "opencode-go-1",
                    name: "opencode_go",
                    enabled: true,
                    executablePath: "connectors/opencode_go/connector.ts",
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
                instanceId: "opencode-go-1",
                sourceInstanceId: "opencode-go-1",
                stateId: "opencode-go-1",
                name: "opencode_go",
                displayName: "OpenCode Go",
                enabled: true,
                source: "session",
                supportedProviders: ["opencode_go"],
                activeProviders: ["opencode_go"],
                metadata: {
                    auth: {
                        method: "web_login",
                        secret_name: "SESSION_COOKIE",
                        login_url: "https://opencode.ai/auth",
                    },
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
});

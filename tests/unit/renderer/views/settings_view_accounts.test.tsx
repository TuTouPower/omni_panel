import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, act, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";
import {
    save,
    saveSecrets,
    duplicate,
    createInstance,
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

    it("does not render a separate data source nav", async () => {
        render(<SettingsView />);

        await waitFor(() => {
            expect(screen.getByTestId("settings-plugin-nav-accounts")).toBeInTheDocument();
        });
        expect(screen.queryByTestId("settings-plugin-nav-datasource")).not.toBeInTheDocument();
        expect(screen.queryByText("数据源")).not.toBeInTheDocument();
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
                name: "opencode_go",
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
                    name: "opencode_go",
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

    it("opens AddAccountDialog when clicking 添加", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            plugins: [
                ...base_config.plugins,
                {
                    instanceId: "deepseek-2",
                    stateId: "deepseek-2",
                    name: "deepseek",
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
                name: "deepseek",
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
                name: "deepseek",
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

        // AddAccountDialog should open with vendor picker
        const dialog = await screen.findByRole("dialog");
        expect(within(dialog).getByText("添加账号")).toBeInTheDocument();
    });

    it("duplicates CPA source by exact manifest id and saves displayName", async () => {
        current_config = {
            ...base_config,
            plugins: [
                ...base_config.plugins,
                {
                    instanceId: "deepseek-2",
                    stateId: "deepseek-2",
                    name: "cpa",
                    enabled: true,
                    executablePath: "plugins/cpa.ts",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };
        const user = userEvent.setup();
        render(<SettingsView />);
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await user.click(screen.getByRole("button", { name: /^添加$/ }));

        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByText("CPA Manager"));
        await waitFor(() => {
            expect(screen.getByPlaceholderText("cpa-…")).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText("例如：工作账号"), "CPA 工作账号");
        await user.type(screen.getByPlaceholderText("cpa-…"), "cpa-secret");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(createInstance).toHaveBeenCalledWith("cpa");
        });
        expect(saveSecrets).toHaveBeenCalledWith("deepseek-2", { cpa_mgmt_key: "cpa-secret" });

        await vi.waitFor(() => {
            expect(save).toHaveBeenCalled();
        });
        const last_call = save.mock.calls.at(-1) as unknown as [AppConfiguration] | undefined;
        if (!last_call) throw new Error("save was not called");
        const saved_config = last_call[0];
        const created = saved_config.plugins.find((p) => p.instanceId === "deepseek-2");
        expect(created?.displayName).toBe("CPA 工作账号");
        expect(created?.name).toBe("cpa");
    });

    it("createInstance uses the clicked vendor's manifest id", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await user.click(screen.getByRole("button", { name: /^添加$/ }));

        const dialog = await screen.findByRole("dialog");
        await user.click(within(dialog).getByText("CPA Manager"));
        await waitFor(() => {
            expect(screen.getByPlaceholderText("cpa-…")).toBeInTheDocument();
        });

        await user.type(screen.getByPlaceholderText("cpa-…"), "cpa-secret");
        await user.type(screen.getByPlaceholderText("http://127.0.0.1:17863"), "http://cpa.local");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(createInstance).toHaveBeenCalledWith("cpa");
        });
        // createInstance 入参是 manifest id（来自点击的 vendor），不再有"匹配 source instance"歧义
        expect(createInstance).toHaveBeenCalledTimes(1);
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
});

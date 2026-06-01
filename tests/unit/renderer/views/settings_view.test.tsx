import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";

const save = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const saveSecrets = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
const duplicate = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

const config: AppConfiguration = {
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

vi.mock("../../../../src/renderer/hooks/use-config", () => ({
    useConfig: () => ({
        config,
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
            },
            popup: {
                report_content_height: vi.fn(),
            },
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
            ...config,
            plugins: [
                {
                    ...config.plugins[0],
                    parameterValues: {},
                    endpointOverrides: { default: "https://api.deepseek.example" },
                },
                config.plugins[1],
            ],
        });
    });

    it("renders CPA connector settings page from accounts", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await waitFor(() => {
            expect(screen.getAllByText("CPA 额度连接器").length).toBeGreaterThan(0);
        });
        const editButtons = screen.getAllByTitle("编辑");
        const cpaEditButton = editButtons[1];
        if (!cpaEditButton) throw new Error("missing CPA edit button");
        await user.click(cpaEditButton);

        await waitFor(() => {
            expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();
        });
        expect(screen.getByLabelText("CPA-Manager URL")).toHaveValue("http://cpa.example");
        expect(screen.getByLabelText("管理密钥")).toHaveValue("***");
        expect(screen.getByLabelText("监控 Claude")).toBeChecked();
        expect(screen.getByText("Claude 1")).toBeInTheDocument();
        expect(screen.getByText("Claude Account")).toBeInTheDocument();
    });
});

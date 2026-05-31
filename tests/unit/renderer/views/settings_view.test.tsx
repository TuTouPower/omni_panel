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
    overviewDisplayMode: "tabs",
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
    ],
};

vi.mock("../../../../src/renderer/hooks/use-config", () => ({
    useConfig: () => ({
        config,
        hasSecrets: {},
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
            plugin: {
                list: vi.fn().mockResolvedValue([
                    {
                        instanceId: "deepseek-1",
                        stateId: "deepseek-1",
                        name: "DeepSeek",
                        displayName: "DeepSeek",
                        enabled: true,
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
            },
            event: {
                onStateChange: vi.fn(),
                onThemeChange: vi.fn(),
            },
            log: vi.fn(),
        };
    });

    it("saves endpoint overrides and secrets without putting secrets in config", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await user.click(screen.getByTitle("编辑"));
        await waitFor(() => expect(screen.getByLabelText("API 密钥")).toBeInTheDocument());

        await user.type(screen.getByLabelText("API 密钥"), "sk-test");
        await user.type(screen.getByLabelText("接口地址"), "https://api.deepseek.example ");
        await user.click(screen.getByTestId("settings-save-btn-deepseek-1"));

        await waitFor(() =>
            expect(saveSecrets).toHaveBeenCalledWith("deepseek-1", { API_KEY: "sk-test" }),
        );
        expect(save).toHaveBeenCalledWith({
            ...config,
            plugins: [
                {
                    ...config.plugins[0],
                    parameterValues: {},
                    endpointOverrides: { default: "https://api.deepseek.example" },
                },
            ],
        });
    });
});

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpaConnectorSettings } from "../../../../src/renderer/components/CpaConnectorSettings";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";
import type { UsageItem } from "../../../../src/shared/schemas/plugin-output";

type SaveHandler = (
    nonSecrets: Record<string, string>,
    endpointOverrides: Record<string, string>,
    refreshIntervalSeconds: number,
) => Promise<void>;

function usageItem(overrides: Partial<UsageItem> = {}): UsageItem {
    return {
        id: "claude-main",
        provider: "claude",
        source: "cpa",
        sourceInstanceId: "cpa-1",
        accountId: "claude-account",
        accountLabel: "Claude Account",
        name: "Claude 额度",
        used: 10,
        limit: 100,
        displayStyle: "percent",
        status: "normal",
        ...overrides,
    };
}

function connector(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
    return {
        instanceId: "cpa-1",
        sourceInstanceId: "cpa-1",
        stateId: "cpa-1",
        name: "CPA",
        displayName: "CPA",
        enabled: true,
        source: "cpa",
        supportedProviders: ["claude", "codex", "gemini", "antigravity", "kimi"],
        activeProviders: ["claude", "codex"],
        metadata: {
            name: "CPA",
            defaultSource: "cpa",
            endpoints: { default: "http://localhost:8080" },
            parameters: [
                { name: "cpa_mgmt_key", label: "管理密钥", type: "secret", required: true },
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
                    defaultValue: "true",
                },
                {
                    name: "monitor_gemini",
                    label: "Gemini",
                    type: "boolean",
                    required: false,
                    defaultValue: "true",
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
        },
        snapshot: {
            status: "ready",
            updatedAt: "2026-05-31T00:00:00.000Z",
            items: [
                usageItem({ accountLabel: "Claude Account" }),
                usageItem({
                    id: "codex-main",
                    provider: "codex",
                    accountId: "codex-account",
                    accountLabel: "Codex Account",
                    name: "Codex 额度",
                }),
            ],
        },
        ...overrides,
    };
}

function renderSettings(overrides: Partial<Parameters<typeof CpaConnectorSettings>[0]> = {}) {
    const props = {
        connector: connector(),
        config: {
            endpointOverrides: { default: "http://cpa.example" },
            parameterValues: { monitor_codex: "false" },
            refreshIntervalSeconds: 300,
        },
        hasSecrets: { cpa_mgmt_key: true },
        onSave: vi.fn<SaveHandler>().mockResolvedValue(undefined),
        onSaveSecrets: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        onRefresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        ...overrides,
    };
    return { ...render(<CpaConnectorSettings {...props} />), props };
}

describe("CpaConnectorSettings", () => {
    it("renders connected status, URL, secret placeholder, buttons, monitor switches, and accounts", () => {
        renderSettings();

        expect(screen.getByText("CPA 额度连接器")).toBeInTheDocument();
        expect(screen.getByText("已连接")).toBeInTheDocument();
        expect(screen.getByLabelText("CPA-Manager URL")).toHaveValue("http://cpa.example");
        expect(screen.getByLabelText("管理密钥")).toHaveValue("***");
        expect(screen.getByRole("button", { name: "测试连接" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "立即同步" })).toBeInTheDocument();
        expect(screen.getByLabelText("监控 Claude")).toBeChecked();
        expect(screen.getByLabelText("监控 Codex")).not.toBeChecked();
        expect(screen.getByLabelText("监控 Gemini")).toBeChecked();
        expect(screen.getByLabelText("监控 Antigravity")).not.toBeChecked();
        expect(screen.getByLabelText("监控 Kimi")).not.toBeChecked();
        expect(screen.getByText("Claude 1")).toBeInTheDocument();
        expect(screen.getByText("Claude Account")).toBeInTheDocument();
        expect(screen.getByText("Codex 1")).toBeInTheDocument();
    });

    it("renders partial failure and disconnected statuses", () => {
        const { rerender } = renderSettings({
            connector: connector({
                snapshot: {
                    status: "failed",
                    error: "network error",
                    items: [usageItem()],
                },
            }),
        });
        expect(screen.getByText("部分失败")).toBeInTheDocument();

        rerender(
            <CpaConnectorSettings
                connector={connector({ snapshot: { status: "idle" } })}
                config={{ endpointOverrides: {}, parameterValues: {}, refreshIntervalSeconds: 300 }}
                hasSecrets={{}}
                onSave={vi.fn()}
                onSaveSecrets={vi.fn()}
                onRefresh={vi.fn()}
            />,
        );
        expect(screen.getByText("未连接")).toBeInTheDocument();
    });

    it("calls refresh from immediate sync", async () => {
        const user = userEvent.setup();
        const onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        renderSettings({ onRefresh });

        await user.click(screen.getByRole("button", { name: "立即同步" }));

        expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it("saves monitor changes and does not save placeholder secret", async () => {
        const user = userEvent.setup();
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        const onSaveSecrets = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        renderSettings({ onSave, onSaveSecrets });

        await user.click(screen.getByLabelText("监控 Claude"));
        await user.click(screen.getByLabelText("监控 Antigravity"));
        await user.clear(screen.getByLabelText("CPA-Manager URL"));
        await user.type(screen.getByLabelText("CPA-Manager URL"), "http://new-cpa.example ");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        expect(onSave).toHaveBeenCalledWith(
            {
                monitor_codex: "false",
                monitor_claude: "false",
                monitor_gemini: "true",
                monitor_antigravity: "true",
                monitor_kimi: "false",
            },
            { default: "http://new-cpa.example" },
            300,
        );
        expect(onSaveSecrets).not.toHaveBeenCalled();
    });

    it("saves a newly entered management key", async () => {
        const user = userEvent.setup();
        const onSaveSecrets = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        renderSettings({ hasSecrets: {}, onSaveSecrets });

        await user.type(screen.getByLabelText("管理密钥"), "new-secret");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(onSaveSecrets).toHaveBeenCalledWith({ cpa_mgmt_key: "new-secret" });
        });
    });

    it("does not preserve imported cpa_mgmt_key in non-secret config", async () => {
        const user = userEvent.setup();
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        renderSettings({
            onSave,
            config: {
                endpointOverrides: { default: "http://cpa.example" },
                parameterValues: {
                    cpa_mgmt_key: "leaked-secret",
                    monitor_codex: "false",
                },
                refreshIntervalSeconds: 300,
            },
        });

        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        if (!call) return;
        expect(call[0]).not.toHaveProperty("cpa_mgmt_key");
    });

    it("shows an error when save fails", async () => {
        const user = userEvent.setup();
        const onSave = vi.fn<SaveHandler>().mockRejectedValue(new Error("save failed"));
        renderSettings({ onSave });

        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent("保存失败");
        });
        expect(screen.getByTestId("cpa-settings-save-btn")).not.toBeDisabled();
    });

    it("catches refresh failure and shows an error", async () => {
        const user = userEvent.setup();
        const onRefresh = vi
            .fn<() => Promise<void>>()
            .mockRejectedValue(new Error("refresh failed"));
        renderSettings({ onRefresh });

        await user.click(screen.getByRole("button", { name: "立即同步" }));

        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent("同步失败");
        });
    });
});

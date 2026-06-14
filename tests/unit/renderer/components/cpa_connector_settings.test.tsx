import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpaConnectorSettings } from "../../../../src/renderer/components/CpaConnectorSettings";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";
import type { UsageItem } from "../../../../src/shared/schemas/plugin-output";

type SaveHandler = (
    nonSecrets: Record<string, string>,
    endpointOverrides: Record<string, string>,
    refreshIntervalSeconds: number,
    displayName: string,
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
            enabled: true,
        },
        enabled: true,
        displayName: "CPA",
        globalIntervalLabel: "5 分钟",
        hasSecrets: { cpa_mgmt_key: true },
        onSave: vi.fn<SaveHandler>().mockResolvedValue(undefined),
        onSaveSecrets: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        onToggleEnabled: vi.fn(),
        onRefresh: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        ...overrides,
    };
    return { ...render(<CpaConnectorSettings {...props} />), props };
}

describe("CpaConnectorSettings", () => {
    beforeEach(() => {
        // Defensive: sub-components or future additions may access window.usageboard.log
        window.usageboard = {
            platform: "win32",
            log: vi.fn(),
        } as unknown as typeof window.usageboard;
    });

    it("renders two-column layout with config fields, connection status, sync settings, and discovered accounts", () => {
        renderSettings();

        // Config fields
        expect(screen.getByLabelText("CPA-Manager URL")).toHaveValue("http://cpa.example");
        expect(screen.getByLabelText("管理密钥")).toHaveValue("***");

        // Connection status
        expect(screen.getByText("已连接")).toBeInTheDocument();

        // Discovered accounts
        expect(screen.getByText("Claude Account")).toBeInTheDocument();
        expect(screen.getByText("Codex Account")).toBeInTheDocument();
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
                config={{
                    endpointOverrides: {},
                    parameterValues: {},
                    refreshIntervalSeconds: 300,
                    enabled: true,
                }}
                enabled={true}
                displayName="CPA"
                globalIntervalLabel="5 分钟"
                hasSecrets={{}}
                onSave={vi.fn()}
                onSaveSecrets={vi.fn()}
                onToggleEnabled={vi.fn()}
                onRefresh={vi.fn()}
            />,
        );
        expect(screen.getByText("未连接")).toBeInTheDocument();
    });

    it("saves monitor changes and does not save placeholder secret", async () => {
        const user = userEvent.setup();
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        const onSaveSecrets = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        renderSettings({ onSave, onSaveSecrets });

        // Find monitor toggle buttons by their row text
        const claude_matches = screen.getAllByText("Claude");
        const claude_vendor = claude_matches.find((el) => el.classList.contains("cr-vendor"));
        if (!claude_vendor) throw new Error("missing Claude scope row");
        const claudeRow = claude_vendor.closest(".cfg-scope-row");
        const antigravity_matches = screen.getAllByText("Antigravity");
        const antigravity_vendor = antigravity_matches.find((el) =>
            el.classList.contains("cr-vendor"),
        );
        if (!antigravity_vendor) throw new Error("missing Antigravity scope row");
        const antigravityRow = antigravity_vendor.closest(".cfg-scope-row");
        if (!claudeRow || !antigravityRow) throw new Error("missing monitor rows");

        // Toggle monitor_claude off
        const claudeBtn = claudeRow.querySelector(".sw");
        const antigravityBtn = antigravityRow.querySelector(".sw");
        if (!claudeBtn || !antigravityBtn) throw new Error("missing toggle buttons");
        await user.click(claudeBtn);
        // Toggle monitor_antigravity on
        await user.click(antigravityBtn);
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
            "CPA",
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
                enabled: true,
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

    it("renders remove data source button", () => {
        const onRemove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
        renderSettings({ onRemove });

        expect(screen.getByText("移除数据源")).toBeInTheDocument();
    });

    it("calls onToggleEnabled when clicking the enabled switch", async () => {
        const user = userEvent.setup();
        const onToggleEnabled = vi.fn();
        renderSettings({ enabled: true, onToggleEnabled });

        const enabledRow = screen.getByText("启用").closest(".cfg-row");
        const btn = enabledRow?.querySelector(".sw");
        expect(btn).toBeTruthy();
        expect(btn).toHaveAttribute("data-on", "1");

        if (!btn) throw new Error("missing enabled switch");
        await user.click(btn);
        expect(onToggleEnabled).toHaveBeenCalledWith(false);
    });

    it("renders enabled switch as off when disabled", () => {
        renderSettings({ enabled: false });

        const enabledRow = screen.getByText("启用").closest(".cfg-row");
        const btn = enabledRow?.querySelector(".sw");
        expect(btn).toHaveAttribute("data-on", "0");
    });

    it("renders label map edit buttons in sync scope rows", () => {
        const onEditLabelMap = vi.fn();
        renderSettings({
            onEditLabelMap,
            connector: connector({
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-05-31T00:00:00.000Z",
                    items: [
                        usageItem({ provider: "claude" }),
                        usageItem({ id: "codex-1", provider: "codex", accountLabel: "CX" }),
                    ],
                },
            }),
        });

        // Label map buttons in sync scope rows (one per MONITOR)
        const tag_buttons = screen.getAllByTitle("编辑数据标签映射");
        expect(tag_buttons.length).toBe(5);

        // No label map buttons in discovered accounts section
        const disc_section = screen.getByText("已发现账号").closest(".cpa-disc");
        const disc_tag_buttons = disc_section?.querySelectorAll('[title="编辑数据标签映射"]');
        expect(disc_tag_buttons?.length ?? 0).toBe(0);
    });

    it("does not show accountId in discovered account rows", () => {
        renderSettings();

        expect(screen.queryByText("claude-account")).not.toBeInTheDocument();
        expect(screen.queryByText("codex-account")).not.toBeInTheDocument();
        expect(screen.getByText("Claude Account")).toBeInTheDocument();
    });

    it("filters discovered accounts to the selected provider", () => {
        renderSettings({
            selectedProvider: "gemini",
            connector: connector({
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-05-31T00:00:00.000Z",
                    items: [
                        usageItem({ provider: "claude", accountLabel: "Claude Account" }),
                        usageItem({ provider: "codex", accountLabel: "Codex Account" }),
                        usageItem({ provider: "gemini", accountLabel: "Gemini Account" }),
                    ],
                },
            }),
        });

        expect(screen.getByText("Gemini Account")).toBeInTheDocument();
        expect(screen.queryByText("Claude Account")).not.toBeInTheDocument();
        expect(screen.queryByText("Codex Account")).not.toBeInTheDocument();
    });

    it("renders alias field with display name", () => {
        renderSettings({ displayName: "公司 CPA" });
        expect(screen.getByLabelText("别名")).toHaveValue("公司 CPA");
    });

    it("renders follow-global refresh toggle", () => {
        renderSettings();
        expect(screen.getByText("跟随全局自动刷新间隔")).toBeInTheDocument();
    });

    it("shows global interval label when follow-global is on", () => {
        renderSettings({
            config: {
                endpointOverrides: { default: "http://cpa.example" },
                parameterValues: {},
                refreshIntervalSeconds: 0,
                enabled: true,
            },
            globalIntervalLabel: "5 分钟",
        });
        expect(screen.getByText(/当前全局为.*5 分钟.*自动刷新/)).toBeInTheDocument();
    });

    it("shows frequency selector when follow-global is off", () => {
        renderSettings({
            config: {
                endpointOverrides: { default: "http://cpa.example" },
                parameterValues: {},
                refreshIntervalSeconds: 300,
                enabled: true,
            },
        });
        expect(screen.getByText("该数据源刷新频率")).toBeInTheDocument();
    });

    it("calls onEditLabelMap when clicking sync scope edit button", async () => {
        const user = userEvent.setup();
        const onEditLabelMap = vi.fn();
        renderSettings({ onEditLabelMap });

        const claude_btn = screen.getAllByTitle("编辑数据标签映射")[0];
        await user.click(claude_btn);
        expect(onEditLabelMap).toHaveBeenCalledWith("claude");
    });

    it("does not render '自动同步' or '同步失败通知'", () => {
        renderSettings();
        expect(screen.queryByText("自动同步")).not.toBeInTheDocument();
        expect(screen.queryByText("同步失败通知")).not.toBeInTheDocument();
    });

    it("saves with follow-global interval as 0", async () => {
        const user = userEvent.setup();
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        renderSettings({
            onSave,
            config: {
                endpointOverrides: { default: "http://cpa.example" },
                parameterValues: {},
                refreshIntervalSeconds: 300,
                enabled: true,
            },
        });

        // Toggle follow-global on
        const followRow = screen.getByText("跟随全局自动刷新间隔").closest(".cfg-row");
        const btn = followRow?.querySelector(".sw");
        if (!btn) throw new Error("missing follow-global toggle");
        await user.click(btn);

        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        if (!call) return;
        expect(call[2]).toBe(0); // follow-global saves interval as 0
    });

    it("calls onRemove when remove button is clicked and confirmed", async () => {
        const user = userEvent.setup();
        window.confirm = vi.fn().mockReturnValue(true);
        const onRemove = vi.fn();
        renderSettings({ onRemove });

        await user.click(screen.getByText("移除数据源"));
        expect(window.confirm).toHaveBeenCalled();
        expect(onRemove).toHaveBeenCalled();
    });

    it("does not call onRemove when remove is cancelled", async () => {
        const user = userEvent.setup();
        window.confirm = vi.fn().mockReturnValue(false);
        const onRemove = vi.fn();
        renderSettings({ onRemove });

        await user.click(screen.getByText("移除数据源"));
        expect(onRemove).not.toHaveBeenCalled();
    });
});

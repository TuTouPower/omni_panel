import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { AccountDialog } from "../../../../src/renderer/components/AccountDialog";

// 子组件替换为 stub，专注测 AccountDialog 的 mode 分支（add 无 instanceId →
// AddAccountDialog；否则 Dialog + SettingsForm）。
vi.mock("../../../../src/renderer/components/AddAccountDialog", () => ({
    AddAccountDialog: () => <div data-testid="add-account-dialog" />,
}));
vi.mock("../../../../src/renderer/components/SettingsForm", () => ({
    SettingsForm: () => <div data-testid="settings-form" />,
}));

function make_props(overrides: Partial<Parameters<typeof AccountDialog>[0]> = {}) {
    return {
        mode: "edit" as const,
        instanceId: "inst-1",
        pluginName: "deepseek",
        pluginInfo: {
            instanceId: "inst-1",
            sourceInstanceId: "inst-1",
            stateId: "inst-1",
            name: "deepseek",
            displayName: "DeepSeek",
            enabled: true,
            source: "poll",
            supportedProviders: ["deepseek"],
            activeProviders: ["deepseek"],
            metadata: { parameters: [], endpoints: { default: null } },
        },
        pluginConfig: { parameterValues: {}, endpointOverrides: {}, refreshIntervalSeconds: 300 },
        pluginInfos: [],
        catalog: [],
        hasSecrets: {},
        onSave: vi.fn().mockResolvedValue(undefined),
        onAddAccount: vi.fn().mockResolvedValue(undefined),
        onClose: vi.fn(),
        globalIntervalLabel: "5 分钟",
        ...overrides,
    } as Parameters<typeof AccountDialog>[0];
}

describe("AccountDialog 关键分支（t397 AC-003）", () => {
    it("mode=edit 渲染编辑对话框 + SettingsForm", () => {
        render(<AccountDialog {...make_props()} />);
        expect(screen.getByText("编辑账号")).toBeInTheDocument();
        expect(screen.getByTestId("settings-form")).toBeInTheDocument();
    });

    it("mode=add 无 instanceId 渲染 AddAccountDialog（服务选择）", () => {
        render(<AccountDialog {...make_props({ mode: "add", instanceId: undefined })} />);
        expect(screen.getByTestId("add-account-dialog")).toBeInTheDocument();
    });

    it("Escape 键触发 onClose", () => {
        const props = make_props();
        render(<AccountDialog {...props} />);
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(props.onClose).toHaveBeenCalled();
    });
});

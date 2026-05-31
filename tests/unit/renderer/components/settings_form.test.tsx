import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm } from "../../../../src/renderer/components/SettingsForm";
import type { PluginParameterMetadata } from "../../../../src/shared/schemas/plugin-metadata";

const baseParams: PluginParameterMetadata[] = [
    {
        name: "API_KEY",
        label: "API Key",
        type: "secret",
        required: true,
    },
    {
        name: "MODEL",
        label: "Model",
        type: "choice",
        required: false,
        options: [
            { label: "chat", value: "chat" },
            { label: "coder", value: "coder" },
        ],
    },
];

function renderForm(overrides: Record<string, unknown> = {}) {
    const defaults = {
        instanceId: "deepseek",
        name: "DeepSeek",
        parameters: baseParams,
        values: { MODEL: "chat" },
        hasSecrets: { API_KEY: true },
        refreshIntervalSeconds: 300,
        onSave: vi.fn().mockResolvedValue(undefined),
        ...overrides,
    };
    return { ...render(<SettingsForm {...defaults} />), onSave: defaults.onSave };
}

describe("SettingsForm", () => {
    it("renders form with plugin name", () => {
        renderForm();
        expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    });

    it("renders parameter labels", () => {
        renderForm();
        expect(screen.getByText("API Key")).toBeInTheDocument();
        expect(screen.getByText("Model")).toBeInTheDocument();
    });

    it("renders refresh interval input with correct default", () => {
        renderForm({ refreshIntervalSeconds: 600 });
        const input = screen.getByTestId("settings-refresh-interval-deepseek");
        expect(input).toHaveValue(10);
    });

    it("renders save button with default text", () => {
        renderForm();
        expect(screen.getByTestId("settings-save-btn-deepseek")).toHaveTextContent("保存");
    });

    it("does not render duplicate button when onDuplicate is not provided", () => {
        renderForm();
        expect(screen.queryByTestId("settings-duplicate-btn-deepseek")).not.toBeInTheDocument();
    });

    it("renders duplicate button when onDuplicate is provided", () => {
        renderForm({ onDuplicate: vi.fn() });
        expect(screen.getByTestId("settings-duplicate-btn-deepseek")).toBeInTheDocument();
    });

    it("calls onDuplicate with instanceId when duplicate button clicked", async () => {
        const onDuplicate = vi.fn();
        const user = userEvent.setup();
        renderForm({ onDuplicate });
        await user.click(screen.getByTestId("settings-duplicate-btn-deepseek"));
        expect(onDuplicate).toHaveBeenCalledWith("deepseek");
    });

    it("submits form and calls onSave with correct arguments", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        renderForm({
            onSave,
            parameters: [
                {
                    name: "endpoint",
                    label: "Endpoint",
                    type: "string",
                    required: false,
                    defaultValue: "https://api.example.com",
                },
            ],
            values: {},
            hasSecrets: {},
        });
        await user.click(screen.getByTestId("settings-save-btn-deepseek"));
        expect(onSave).toHaveBeenCalledTimes(1);
        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        const [instanceId, nonSecrets, , , interval] = call!;
        expect(instanceId).toBe("deepseek");
        expect(nonSecrets).toHaveProperty("endpoint");
        expect(interval).toBeGreaterThanOrEqual(60);
    });

    it("submits endpoint overrides separately from parameter values", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        renderForm({
            onSave,
            parameters: [],
            values: {},
            hasSecrets: {},
            endpoints: { default: null },
            endpointValues: { default: "https://old.example" },
        });

        const endpoint = screen.getByLabelText("接口地址");
        await user.clear(endpoint);
        await user.type(endpoint, "https://new.example ");
        await user.click(screen.getByTestId("settings-save-btn-deepseek"));

        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        const [, nonSecrets, , endpointOverrides] = call!;
        expect(nonSecrets).not.toHaveProperty("default");
        expect(endpointOverrides).toEqual({ default: "https://new.example" });
    });

    it("shows saving text while save is pending", async () => {
        let resolvePromise: () => void;
        const onSave = vi.fn().mockImplementation(
            () =>
                new Promise<void>((r) => {
                    resolvePromise = r;
                }),
        );
        const user = userEvent.setup();
        renderForm({
            onSave,
            parameters: [],
            values: {},
            hasSecrets: {},
        });
        await user.click(screen.getByTestId("settings-save-btn-deepseek"));
        expect(screen.getByTestId("settings-save-btn-deepseek")).toHaveTextContent("保存中...");
        await act(async () => {
            await Promise.resolve();
            resolvePromise();
        });
    });

    it("shows saved text after successful save", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        renderForm({
            onSave,
            parameters: [],
            values: {},
            hasSecrets: {},
        });
        await user.click(screen.getByTestId("settings-save-btn-deepseek"));
        await act(async () => {
            await Promise.resolve();
        });
        expect(screen.getByTestId("settings-save-btn-deepseek")).toHaveTextContent("已保存");
    });

    it("skips secret parameter value when it equals placeholder ***", async () => {
        const onSave = vi.fn().mockResolvedValue(undefined);
        const user = userEvent.setup();
        renderForm({
            onSave,
            parameters: [
                {
                    name: "API_KEY",
                    label: "API Key",
                    type: "secret",
                    required: true,
                },
            ],
            values: {},
            hasSecrets: { API_KEY: true },
        });
        await user.click(screen.getByTestId("settings-save-btn-deepseek"));
        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        const [, , secrets] = call!;
        expect(secrets).not.toHaveProperty("API_KEY");
    });
});

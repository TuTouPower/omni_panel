import { describe, it, expect, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SettingsForm } from "../../../../src/renderer/components/SettingsForm";
import type { PluginParameterMetadata } from "../../../../src/shared/schemas/plugin-metadata";

type SaveHandler = (
    instanceId: string,
    nonSecrets: Record<string, string>,
    secrets: Record<string, string>,
    endpointOverrides: Record<string, string>,
    refreshIntervalSeconds: number,
) => Promise<void>;

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
        parameters: baseParams,
        values: { MODEL: "chat" },
        hasSecrets: { API_KEY: true },
        refreshIntervalSeconds: 300,
        onSave: vi.fn<SaveHandler>().mockResolvedValue(undefined),
        ...overrides,
    };
    return { ...render(<SettingsForm {...defaults} />), onSave: defaults.onSave };
}

describe("SettingsForm", () => {
    it("renders form fields", () => {
        renderForm();
        expect(screen.getByText("API Key")).toBeInTheDocument();
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
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
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
        if (!call) return;
        const [instanceId, nonSecrets, , , interval] = call;
        expect(instanceId).toBe("deepseek");
        expect(nonSecrets).toHaveProperty("endpoint");
        expect(interval).toBeGreaterThanOrEqual(60);
    });

    it("submits endpoint overrides separately from parameter values", async () => {
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
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
        if (!call) return;
        const [, nonSecrets, , endpointOverrides] = call;
        expect(nonSecrets).not.toHaveProperty("default");
        expect(endpointOverrides).toEqual({ default: "https://new.example" });
    });

    it("shows saving text while save is pending", async () => {
        let resolvePromise: () => void;
        const onSave = vi.fn<SaveHandler>().mockImplementation(
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
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
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
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
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
        if (!call) return;
        const [, , secrets] = call;
        expect(secrets).not.toHaveProperty("API_KEY");
    });
});

describe("SettingsForm cookie login", () => {
    it("renders 网页登录 button for MiMo SESSION_COOKIE parameter", () => {
        renderForm({
            instanceId: "mimo-1",
            name: "MiMo",
            providerId: "mimo",
            parameters: [
                {
                    name: "SESSION_COOKIE",
                    label: "Cookie",
                    type: "secret",
                    required: true,
                },
            ],
            values: {},
            hasSecrets: {},
            onCookieLogin: vi.fn().mockResolvedValue(true),
        });
        expect(screen.getByText("网页登录")).toBeInTheDocument();
    });

    it("does not render 网页登录 for non-MiMo providers", () => {
        renderForm({
            instanceId: "kimi-1",
            name: "Kimi",
            providerId: "kimi",
            parameters: [
                {
                    name: "SESSION_COOKIE",
                    label: "Cookie",
                    type: "secret",
                    required: true,
                },
            ],
            values: {},
            hasSecrets: {},
            onCookieLogin: vi.fn(),
        });
        expect(screen.queryByText("网页登录")).not.toBeInTheDocument();
    });

    it("shows 登录中... while cookieLogin is in progress", async () => {
        // Use a deferred promise so we can observe the loading state
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        let resolve_login: (v: boolean) => void = () => {};
        const login_promise = new Promise<boolean>((r) => {
            resolve_login = r;
        });
        const onCookieLogin = vi.fn().mockReturnValue(login_promise);
        const user = userEvent.setup();

        renderForm({
            instanceId: "mimo-1",
            name: "MiMo",
            providerId: "mimo",
            parameters: [
                {
                    name: "SESSION_COOKIE",
                    label: "Cookie",
                    type: "secret",
                    required: true,
                },
            ],
            values: {},
            hasSecrets: {},
            onCookieLogin,
        });

        await user.click(screen.getByText("网页登录"));
        expect(onCookieLogin).toHaveBeenCalledWith("mimo-1");
        // Button should show loading text and be disabled
        const btn = screen.getByText("登录中...");
        expect(btn).toBeDisabled();

        await act(async () => {
            resolve_login(true);
            await Promise.resolve();
        });
        await vi.waitFor(() => {
            expect(screen.getByText("网页登录")).toBeInTheDocument();
        });
    });
});

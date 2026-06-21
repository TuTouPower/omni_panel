import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddAccountDialog } from "../../../../src/renderer/components/AddAccountDialog";
import type { AddAccountParams } from "../../../../src/renderer/components/AddAccountDialog";
import type { PluginInfo } from "../../../../src/shared/types/ipc";

const base_plugin: PluginInfo = {
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
                label: "Session Cookie",
                type: "secret",
                required: true,
            },
        ],
    },
    snapshot: { status: "idle" },
};

function get_saved_params(on_save: ReturnType<typeof vi.fn>): AddAccountParams {
    const calls = on_save.mock.calls;
    if (!calls[0]?.[0]) throw new Error("on_save was not called");
    return calls[0][0] as AddAccountParams;
}

describe("AddAccountDialog MIMO session cookie", () => {
    let on_save: ReturnType<typeof vi.fn>;
    let on_close: ReturnType<typeof vi.fn>;
    let on_cpa: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        on_save = vi.fn().mockResolvedValue(undefined);
        on_close = vi.fn();
        on_cpa = vi.fn();
    });

    it("passes SESSION_COOKIE in secrets when adding a session-auth account (MiMo)", async () => {
        const user = userEvent.setup();
        render(
            <AddAccountDialog
                plugin_infos={[base_plugin]}
                has_cpa={false}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        // Step 1: select MiMo from vendor picker
        await user.click(screen.getByText("MiMo"));

        // Step 2: should now show session form with cookie textarea
        const cookie_textarea = screen.getByPlaceholderText(/在浏览器登录/);
        expect(cookie_textarea).toBeInTheDocument();

        // Step 3: type cookie value
        await user.type(cookie_textarea, "api-platform_serviceToken=test123");

        // Step 4: click save
        await user.click(screen.getByText("添加账号"));

        // Verify: SESSION_COOKIE was passed in secrets
        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.secrets).toEqual({
            SESSION_COOKIE: "api-platform_serviceToken=test123",
        });
        expect(saved.vendor_id).toBe("mimo");
        expect(saved.auth_method).toBe("session");
    });

    it("passes SESSION_COOKIE for kimi session-auth account", async () => {
        const kimi_plugin: PluginInfo = {
            ...base_plugin,
            instanceId: "kimi-1",
            name: "Kimi",
            displayName: "Kimi",
            activeProviders: ["kimi"],
            supportedProviders: ["kimi"],
        };
        const user = userEvent.setup();
        render(
            <AddAccountDialog
                plugin_infos={[kimi_plugin]}
                has_cpa={false}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        await user.click(screen.getByText("Kimi"));
        const cookie_textarea = screen.getByPlaceholderText(/在浏览器登录/);
        expect(cookie_textarea).toBeInTheDocument();

        await user.type(cookie_textarea, "access_token=kimikimi");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        expect(get_saved_params(on_save).secrets).toEqual({
            SESSION_COOKIE: "access_token=kimikimi",
        });
    });
});

describe("AddAccountDialog API key", () => {
    let on_save: ReturnType<typeof vi.fn>;
    let on_close: ReturnType<typeof vi.fn>;
    let on_cpa: ReturnType<typeof vi.fn>;

    function apikey_plugin(overrides: Partial<PluginInfo> = {}): PluginInfo {
        return {
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
                        label: "API Key",
                        type: "secret",
                        required: true,
                    },
                ],
            },
            snapshot: { status: "idle" },
            ...overrides,
        };
    }

    beforeEach(() => {
        on_save = vi.fn().mockResolvedValue(undefined);
        on_close = vi.fn();
        on_cpa = vi.fn();
    });

    it("passes API_KEY in secrets when adding an apikey account", async () => {
        const user = userEvent.setup();
        render(
            <AddAccountDialog
                plugin_infos={[apikey_plugin()]}
                has_cpa={false}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        await user.click(screen.getByText("DeepSeek"));

        // Should show API key input
        const key_input = screen.getByPlaceholderText(/sk-/);
        expect(key_input).toBeInTheDocument();
        await user.type(key_input, "sk-test-key-123");

        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.secrets).toEqual({ API_KEY: "sk-test-key-123" });
        expect(saved.vendor_id).toBe("deepseek");
        expect(saved.auth_method).toBe("apikey");
    });

    it("passes endpoint override when provided", async () => {
        const user = userEvent.setup();
        render(
            <AddAccountDialog
                plugin_infos={[apikey_plugin()]}
                has_cpa={false}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        await user.click(screen.getByText("DeepSeek"));
        await user.type(screen.getByPlaceholderText(/sk-/), "sk-key");

        // Fill optional endpoint
        const endpoint_input = screen.getByPlaceholderText("https://api.deepseek.com");
        await user.type(endpoint_input, "https://custom.api.example.com");

        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.endpoint_overrides).toEqual({ default: "https://custom.api.example.com" });
    });

    it("does not include empty endpoint override", async () => {
        const user = userEvent.setup();
        render(
            <AddAccountDialog
                plugin_infos={[apikey_plugin()]}
                has_cpa={false}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        await user.click(screen.getByText("DeepSeek"));
        await user.type(screen.getByPlaceholderText(/sk-/), "sk-key");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.endpoint_overrides).toBeUndefined();
    });

    it("disables vendor button when plugin is not enabled", () => {
        const disabled = apikey_plugin({ enabled: false, activeProviders: [] });
        render(
            <AddAccountDialog
                plugin_infos={[disabled]}
                has_cpa={false}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        const btn = screen.getByText("DeepSeek").closest("button");
        expect(btn?.className).toContain("disabled");
    });

    it("shows GLM in the vendor picker when GLM plugin is available", () => {
        const glm_plugin = apikey_plugin({
            instanceId: "glm-1",
            name: "GLM",
            displayName: "GLM",
            activeProviders: ["glm"],
            supportedProviders: ["glm"],
        });

        render(
            <AddAccountDialog
                plugin_infos={[glm_plugin]}
                has_cpa={false}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        const button = screen.getByText("GLM").closest("button");
        expect(button).toBeInTheDocument();
        expect(button?.className).not.toContain("disabled");
    });

    it("shows CPA button when has_cpa is true", () => {
        render(
            <AddAccountDialog
                plugin_infos={[]}
                has_cpa={true}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        expect(screen.getByText("CPA Manager")).toBeInTheDocument();
    });

    it("calls on_cpa when CPA button is clicked", async () => {
        const user = userEvent.setup();
        render(
            <AddAccountDialog
                plugin_infos={[]}
                has_cpa={true}
                on_close={on_close}
                on_save={on_save}
                on_cpa={on_cpa}
            />,
        );

        await user.click(screen.getByText("CPA Manager"));
        expect(on_cpa).toHaveBeenCalled();
    });
});

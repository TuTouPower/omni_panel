import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AddAccountDialog } from "../../../../src/renderer/components/AddAccountDialog";
import type { AddAccountParams } from "../../../../src/renderer/components/AddAccountDialog";
import type { ConnectorCatalogEntry, PluginInfo } from "../../../../src/shared/types/ipc";

function make_plugin(overrides: Partial<PluginInfo> = {}): PluginInfo {
    return {
        instanceId: "test-1",
        sourceInstanceId: "test-1",
        stateId: "test-1",
        name: "Test",
        displayName: "Test",
        enabled: true,
        source: "poll",
        supportedProviders: ["test"],
        activeProviders: ["test"],
        metadata: null,
        snapshot: { status: "idle" },
        ...overrides,
    };
}

function get_saved_params(on_save: ReturnType<typeof vi.fn>): AddAccountParams {
    const calls = on_save.mock.calls;
    if (!calls[0]?.[0]) throw new Error("on_save was not called");
    return calls[0][0] as AddAccountParams;
}

describe("AddAccountDialog descriptor-driven routing", () => {
    let on_save: ReturnType<typeof vi.fn>;
    let on_close: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        on_save = vi.fn().mockResolvedValue(undefined);
        on_close = vi.fn();
    });

    it("renders apikey form and saves API_KEY for poll connectors without auth descriptor", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "deepseek-1",
            name: "DeepSeek",
            displayName: "DeepSeek",
            source: "poll",
            supportedProviders: ["deepseek"],
            activeProviders: ["deepseek"],
            metadata: {
                name: "deepseek",
                parameters: [{ name: "API_KEY", label: "API Key", type: "secret", required: true }],
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("DeepSeek"));
        const key_input = screen.getByPlaceholderText("sk-…");
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
        expect(saved.source_instance_id).toBe("deepseek-1");
    });

    it("uses descriptor secret_name for apikey descriptor (exa)", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "exa-1",
            name: "Exa",
            displayName: "Exa",
            source: "poll",
            supportedProviders: ["exa"],
            activeProviders: ["exa"],
            metadata: {
                name: "exa",
                auth: {
                    method: "apikey",
                    secret_name: "SERVICE_KEY",
                    extra_fields: ["API_KEY_ID"],
                },
                parameters: [
                    { name: "SERVICE_KEY", label: "Service Key", type: "secret", required: true },
                    { name: "API_KEY_ID", label: "API Key ID", type: "string", required: true },
                ],
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("Exa"));
        const key_input = screen.getByPlaceholderText("exa-…");
        expect(key_input).toBeInTheDocument();
        expect(screen.getByPlaceholderText("例如：my-key-id")).toBeInTheDocument();

        await user.type(key_input, "exa-service-key");
        await user.type(screen.getByPlaceholderText("例如：my-key-id"), "key-id-1");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.secrets).toEqual({ SERVICE_KEY: "exa-service-key" });
        expect(saved.parameter_values).toEqual({ API_KEY_ID: "key-id-1" });
        expect(saved.auth_method).toBe("apikey");
        expect(saved.source_instance_id).toBe("exa-1");
    });

    it("renders session form and saves SESSION_COOKIE for session-source connectors", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "mimo-1",
            name: "MiMo",
            displayName: "MiMo",
            source: "session",
            supportedProviders: ["mimo"],
            activeProviders: ["mimo"],
            metadata: {
                name: "mimo",
                parameters: [
                    {
                        name: "SESSION_COOKIE",
                        label: "Session Cookie",
                        type: "secret",
                        required: true,
                    },
                ],
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("MiMo"));
        expect(screen.getByText("备注")).toBeInTheDocument();
        const cookie_textarea = screen.getByPlaceholderText(/在浏览器登录/);
        expect(cookie_textarea).toBeInTheDocument();
        expect(screen.queryByText("网页登录")).not.toBeInTheDocument();

        await user.type(cookie_textarea, "api-platform_serviceToken=test123");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.secrets).toEqual({
            SESSION_COOKIE: "api-platform_serviceToken=test123",
        });
        expect(saved.vendor_id).toBe("mimo");
        expect(saved.auth_method).toBe("session");
        expect(saved.source_instance_id).toBe("mimo-1");
    });

    it("renders OAuth device form for grok and saves after polling succeeds", async () => {
        const grok = {
            login_start: vi.fn().mockResolvedValue({
                device_code: "dc-123",
                user_code: "ABCD-EFGH",
                verification_uri: "https://auth.x.ai/device",
                verification_uri_complete: "https://auth.x.ai/device?user_code=ABCD-EFGH",
                expires_in: 1800,
                interval: 5,
            }),
            login_poll: vi.fn().mockResolvedValue({ saved: true, token: "grok-access-token" }),
            login_cancel: vi.fn().mockResolvedValue(undefined),
            login_status: vi
                .fn()
                .mockResolvedValue({ has_token: false, expires_at: null, can_refresh: false }),
            logout: vi.fn().mockResolvedValue({ logged_out: true }),
            refresh: vi.fn().mockResolvedValue({ success: true }),
        };
        (window as unknown as { usageboard: unknown }).usageboard = { grok };
        const plugin: PluginInfo = make_plugin({
            instanceId: "grok-1",
            name: "Grok",
            displayName: "Grok",
            source: "poll",
            supportedProviders: ["grok"],
            activeProviders: ["grok"],
            metadata: {
                name: "grok",
                auth: { method: "oauth_device", secret_name: "OAUTH_TOKEN" },
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("Grok"));
        expect(screen.getByText("开始登录")).toBeInTheDocument();
        expect(screen.queryByPlaceholderText("sk-…")).not.toBeInTheDocument();

        await user.click(screen.getByText("开始登录"));
        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.auth_method).toBe("oauth_device");
        expect(saved.secrets).toEqual({ OAUTH_TOKEN: "grok-access-token" });
        expect(saved.source_instance_id).toBe("grok-1");
    });

    it("renders web login form for opencode_go and saves cookie on success", async () => {
        const session = {
            login: vi.fn().mockResolvedValue({ saved: true, cookie: "session=abc" }),
            refresh: vi.fn().mockResolvedValue({ saved: true, cookie: "" }),
        };
        (window as unknown as { usageboard: unknown }).usageboard = { session };
        const plugin: PluginInfo = make_plugin({
            instanceId: "opencode-go-1",
            name: "OpenCode Go",
            displayName: "OpenCode Go",
            source: "session",
            supportedProviders: ["opencode_go"],
            activeProviders: ["opencode_go"],
            metadata: {
                name: "opencode_go",
                auth: {
                    method: "web_login",
                    secret_name: "SESSION_COOKIE",
                    login_url: "https://opencode.ai/auth",
                },
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("OpenCode Go"));
        expect(screen.getByText("网页登录")).toBeInTheDocument();
        expect(screen.queryByPlaceholderText("sk-…")).not.toBeInTheDocument();
        expect(screen.queryByText("复制脚本")).not.toBeInTheDocument();

        await user.click(screen.getByText("网页登录"));
        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.auth_method).toBe("web_login");
        expect(saved.secrets).toEqual({ SESSION_COOKIE: "session=abc" });
        expect(saved.source_instance_id).toBe("opencode-go-1");
    });

    it("renders CpaMgmtForm for cpa_mgmt descriptor (cpa)", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "cpa-1",
            name: "CPA Manager",
            displayName: "CPA Manager",
            source: "gateway",
            supportedProviders: ["claude", "kimi"],
            activeProviders: ["claude", "kimi"],
            metadata: {
                name: "cpa",
                auth: { method: "cpa_mgmt", secret_name: "cpa_mgmt_key", require_endpoint: true },
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("CPA Manager"));
        expect(screen.getByText("CPA 管理密钥")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("http://127.0.0.1:17863")).toBeInTheDocument();
    });

    it("disables CpaMgmtForm save until management key is entered", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "cpa-1",
            name: "CPA Manager",
            displayName: "CPA Manager",
            source: "gateway",
            supportedProviders: ["claude", "kimi"],
            activeProviders: ["claude", "kimi"],
            metadata: {
                name: "cpa",
                auth: { method: "cpa_mgmt", secret_name: "cpa_mgmt_key", require_endpoint: true },
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("CPA Manager"));
        const save_btn = screen.getByText("添加账号").closest("button");
        expect(save_btn).toBeDisabled();
        if (save_btn) {
            await user.click(save_btn);
        }
        expect(on_save).not.toHaveBeenCalled();

        await user.type(screen.getByPlaceholderText("cpa-…"), "cpa-secret");
        await waitFor(() => {
            expect(save_btn).not.toBeDisabled();
        });
        if (save_btn) {
            await user.click(save_btn);
        }
        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.source_instance_id).toBe("cpa-1");
    });

    it("renders local scan form and auth_method local_cli for local source", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "claude-1",
            name: "Claude",
            displayName: "Claude",
            source: "local",
            supportedProviders: ["claude"],
            activeProviders: ["claude"],
            metadata: {
                name: "claude",
                parameters: [
                    { name: "data_dir", label: "Data Dir", type: "string", required: false },
                ],
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("Claude"));
        expect(screen.getByText(/正在扫描本地授权文件/)).toBeInTheDocument();
        expect(screen.getByText("~/.claude/.credentials.json")).toBeInTheDocument();

        const save_btn = screen.getByText("导入账号").closest("button");
        expect(save_btn).toBeEnabled();
        if (save_btn) {
            await user.click(save_btn);
        }

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        const saved = get_saved_params(on_save);
        expect(saved.auth_method).toBe("local_cli");
        expect(saved.source_instance_id).toBe("claude-1");
    });

    it("passes endpoint override when provided", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "deepseek-1",
            name: "DeepSeek",
            displayName: "DeepSeek",
            source: "poll",
            supportedProviders: ["deepseek"],
            activeProviders: ["deepseek"],
            metadata: {
                name: "deepseek",
                parameters: [{ name: "API_KEY", label: "API Key", type: "secret", required: true }],
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("DeepSeek"));
        await user.type(screen.getByPlaceholderText("sk-…"), "sk-key");
        await user.type(
            screen.getByPlaceholderText("默认（官方接口）"),
            "https://custom.api.example.com",
        );
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        expect(get_saved_params(on_save).endpoint_overrides).toEqual({
            default: "https://custom.api.example.com",
        });
    });

    it("does not include empty endpoint override", async () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "deepseek-1",
            name: "DeepSeek",
            displayName: "DeepSeek",
            source: "poll",
            supportedProviders: ["deepseek"],
            activeProviders: ["deepseek"],
            metadata: {
                name: "deepseek",
                parameters: [{ name: "API_KEY", label: "API Key", type: "secret", required: true }],
            },
        });
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("DeepSeek"));
        await user.type(screen.getByPlaceholderText("sk-…"), "sk-key");
        await user.click(screen.getByText("添加账号"));

        await vi.waitFor(() => {
            expect(on_save).toHaveBeenCalledTimes(1);
        });
        expect(get_saved_params(on_save).endpoint_overrides).toBeUndefined();
    });

    it("falls back to apikey form when no connector info is available", async () => {
        const user = userEvent.setup();
        render(<AddAccountDialog plugin_infos={[]} on_close={on_close} on_save={on_save} />);

        await user.click(screen.getByText("Kimi"));
        expect(screen.getByPlaceholderText("sk-…")).toBeInTheDocument();
        expect(screen.getByText("添加 Kimi 账号")).toBeInTheDocument();
    });

    it("enables vendor button when plugin has supportedProviders even if disabled", () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "deepseek-1",
            name: "DeepSeek",
            displayName: "DeepSeek",
            source: "poll",
            supportedProviders: ["deepseek"],
            activeProviders: [],
            enabled: false,
            metadata: {
                name: "deepseek",
                parameters: [{ name: "API_KEY", label: "API Key", type: "secret", required: true }],
            },
        });
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        const btn = screen.getByText("DeepSeek").closest("button");
        expect(btn).toBeEnabled();
    });

    it("shows GLM in the vendor picker when GLM plugin is available", () => {
        const plugin: PluginInfo = make_plugin({
            instanceId: "glm-1",
            name: "GLM",
            displayName: "GLM",
            source: "poll",
            supportedProviders: ["glm"],
            activeProviders: ["glm"],
            metadata: {
                name: "glm",
                parameters: [{ name: "API_KEY", label: "API Key", type: "secret", required: true }],
            },
        });
        render(<AddAccountDialog plugin_infos={[plugin]} on_close={on_close} on_save={on_save} />);

        const button = screen.getByText("GLM").closest("button");
        expect(button).toBeInTheDocument();
        expect(button).toBeEnabled();
    });

    it("shows CPA Manager button in vendor picker", () => {
        render(<AddAccountDialog plugin_infos={[]} on_close={on_close} on_save={on_save} />);

        expect(screen.getByText("CPA Manager")).toBeInTheDocument();
    });

    describe("catalog-driven auth resolution (t121)", () => {
        function make_catalog_entry(
            id: string,
            auth: ConnectorCatalogEntry["metadata"]["auth"],
            overrides: Partial<ConnectorCatalogEntry> = {},
        ): ConnectorCatalogEntry {
            return {
                manifest_id: id,
                source: "poll",
                supported_providers: [id],
                metadata: { name: id, auth, parameters: [] },
                ...overrides,
            };
        }

        const grok_entry = make_catalog_entry("grok", {
            method: "oauth_device",
            secret_name: "OAUTH_TOKEN",
        });
        const exa_entry = make_catalog_entry("exa", {
            method: "apikey",
            secret_name: "SERVICE_KEY",
            extra_fields: ["API_KEY_ID"],
        });
        const opencode_entry: ConnectorCatalogEntry = {
            manifest_id: "opencode_go",
            source: "session",
            supported_providers: ["opencode_go"],
            metadata: {
                name: "opencode_go",
                auth: {
                    method: "web_login",
                    secret_name: "SESSION_COOKIE",
                    login_url: "https://opencode.ai/auth",
                },
                parameters: [],
            },
        };
        const cpa_entry = make_catalog_entry(
            "cpa",
            { method: "cpa_mgmt", secret_name: "cpa_mgmt_key", require_endpoint: true },
            { supported_providers: ["claude", "kimi"], source: "gateway" },
        );

        it("renders OAuthDeviceForm for grok when only catalog is available", async () => {
            const grok = {
                login_start: vi.fn().mockResolvedValue({
                    device_code: "dc-123",
                    user_code: "ABCD-EFGH",
                    verification_uri: "https://auth.x.ai/device",
                    verification_uri_complete: "https://auth.x.ai/device?user_code=ABCD-EFGH",
                    expires_in: 1800,
                    interval: 5,
                }),
                login_poll: vi.fn().mockResolvedValue({ saved: true, token: "grok-access-token" }),
                login_cancel: vi.fn().mockResolvedValue(undefined),
                login_status: vi
                    .fn()
                    .mockResolvedValue({ has_token: false, expires_at: null, can_refresh: false }),
                logout: vi.fn().mockResolvedValue({ logged_out: true }),
                refresh: vi.fn().mockResolvedValue({ success: true }),
            };
            (window as unknown as { usageboard: unknown }).usageboard = { grok };
            const user = userEvent.setup();
            render(
                <AddAccountDialog
                    plugin_infos={[]}
                    catalog={[grok_entry]}
                    on_close={on_close}
                    on_save={on_save}
                />,
            );

            await user.click(screen.getByText("Grok"));
            expect(screen.getByText("开始登录")).toBeInTheDocument();
            expect(screen.queryByPlaceholderText("sk-…")).not.toBeInTheDocument();
            // 表单层 secret_name 绑定（t123）：catalog entry 声明 OAUTH_TOKEN，
            // 表单根容器暴露该值，证明 secret_name 从 catalog → form 正确传递
            const oauth_form = document.querySelector("[data-secret-name]");
            expect(oauth_form?.getAttribute("data-secret-name")).toBe("OAUTH_TOKEN");

            await user.click(screen.getByText("开始登录"));
            await vi.waitFor(() => {
                expect(on_save).toHaveBeenCalledTimes(1);
            });
            const saved = get_saved_params(on_save);
            expect(saved.auth_method).toBe("oauth_device");
            expect(saved.secrets).toEqual({ OAUTH_TOKEN: "grok-access-token" });
        });

        it("renders ExaServiceKeyForm with two required inputs when only catalog is available", async () => {
            const user = userEvent.setup();
            render(
                <AddAccountDialog
                    plugin_infos={[]}
                    catalog={[exa_entry]}
                    on_close={on_close}
                    on_save={on_save}
                />,
            );

            await user.click(screen.getByText("Exa"));
            expect(screen.getByPlaceholderText("exa-…")).toBeInTheDocument();
            expect(screen.getByPlaceholderText("例如：my-key-id")).toBeInTheDocument();
            expect(screen.queryByPlaceholderText("sk-…")).not.toBeInTheDocument();
        });

        it("renders WebLoginForm for opencode_go when only catalog is available", async () => {
            const session = {
                login: vi.fn().mockResolvedValue({ saved: true, cookie: "session=abc" }),
                refresh: vi.fn().mockResolvedValue({ saved: true, cookie: "" }),
            };
            (window as unknown as { usageboard: unknown }).usageboard = { session };
            const user = userEvent.setup();
            render(
                <AddAccountDialog
                    plugin_infos={[]}
                    catalog={[opencode_entry]}
                    on_close={on_close}
                    on_save={on_save}
                />,
            );

            await user.click(screen.getByText("OpenCode Go"));
            expect(screen.getByText("网页登录")).toBeInTheDocument();
            expect(screen.queryByPlaceholderText("sk-…")).not.toBeInTheDocument();
        });

        it("renders CpaMgmtForm for cpa when only catalog is available", async () => {
            const user = userEvent.setup();
            render(
                <AddAccountDialog
                    plugin_infos={[]}
                    catalog={[cpa_entry]}
                    on_close={on_close}
                    on_save={on_save}
                />,
            );

            await user.click(screen.getByText("CPA Manager"));
            expect(screen.getByText("CPA 管理密钥")).toBeInTheDocument();
            expect(screen.getByPlaceholderText("http://127.0.0.1:17863")).toBeInTheDocument();
        });

        it("falls back to apikey form when vendor not in catalog either", async () => {
            const user = userEvent.setup();
            render(
                <AddAccountDialog
                    plugin_infos={[]}
                    catalog={[]}
                    on_close={on_close}
                    on_save={on_save}
                />,
            );

            await user.click(screen.getByText("Kimi"));
            expect(screen.getByPlaceholderText("sk-…")).toBeInTheDocument();
        });
    });
});

describe("AddAccountDialog open connectors dir (t094)", () => {
    afterEach(() => {
        // @ts-expect-error tear down global mock injected per test
        delete window.usageboard;
    });

    function mock_usageboard(open_connectors_dir: ReturnType<typeof vi.fn>) {
        window.usageboard = {
            platform: "win32",
            log: vi.fn(),
            settings: { openConnectorsDir: open_connectors_dir },
        } as unknown as typeof window.usageboard;
    }

    it("renders the open-script-dir button in vendor picker", () => {
        mock_usageboard(vi.fn());
        render(
            <AddAccountDialog
                plugin_infos={[]}
                on_close={vi.fn()}
                on_save={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        expect(screen.getByText("打开脚本目录")).toBeInTheDocument();
    });

    it("invokes settings.openConnectorsDir when button clicked", async () => {
        const open_connectors_dir = vi.fn();
        mock_usageboard(open_connectors_dir);
        const user = userEvent.setup();
        render(
            <AddAccountDialog
                plugin_infos={[]}
                on_close={vi.fn()}
                on_save={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        await user.click(screen.getByText("打开脚本目录"));

        expect(open_connectors_dir).toHaveBeenCalledTimes(1);
    });
});

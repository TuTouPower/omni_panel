import { StrictMode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act, waitFor } from "@testing-library/react";
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

beforeEach(() => {
    window.usageboard = {
        platform: "win32",
        config: {
            getSecrets: vi.fn().mockResolvedValue({ API_KEY: "sk-loaded-secret" }),
            get: vi.fn(),
            save: vi.fn(),
            saveSecrets: vi.fn(),
            duplicate: vi.fn(),
            export: vi.fn(),
            import: vi.fn(),
        },
        connector: {
            getState: vi.fn().mockResolvedValue({ status: "idle" }),
            list: vi.fn(),
            refresh: vi.fn(),
            refreshAll: vi.fn(),
            snapshot: vi.fn(),
        },
        log: vi.fn(),
    } as unknown as typeof window.usageboard;
});

function renderForm(overrides: Record<string, unknown> = {}) {
    const defaults = {
        instanceId: "deepseek",
        parameters: baseParams,
        values: { MODEL: "chat" },
        hasSecrets: { API_KEY: true },
        refreshIntervalSeconds: 300,
        globalIntervalLabel: "5 分钟",
        onSave: vi.fn<SaveHandler>().mockResolvedValue(undefined),
        ...overrides,
    };
    return { ...render(<SettingsForm {...defaults} />), onSave: defaults.onSave };
}

describe("SettingsForm", () => {
    it("renders form fields", () => {
        renderForm();
        expect(screen.getByText("备注")).toBeInTheDocument();
        expect(screen.getByText("API Key")).toBeInTheDocument();
    });

    it("renders parameter labels", () => {
        renderForm();
        expect(screen.getByText("API Key")).toBeInTheDocument();
        expect(screen.getByText("Model")).toBeInTheDocument();
    });

    it("renders follow-global switch with correct initial state", () => {
        renderForm({ refreshIntervalSeconds: 300 });
        const btn = screen.getByTestId("settings-follow-global-deepseek");
        expect(btn).toHaveAttribute("data-on", "0");
        expect(screen.getByTestId("settings-sync-interval-deepseek")).toBeInTheDocument();
    });

    it("defaults to follow-global when refreshIntervalSeconds is 0", () => {
        renderForm({ refreshIntervalSeconds: 0 });
        const btn = screen.getByTestId("settings-follow-global-deepseek");
        expect(btn).toHaveAttribute("data-on", "1");
        expect(screen.getByTestId("settings-global-label-deepseek")).toHaveTextContent(
            "当前全局为「5 分钟」自动刷新",
        );
    });

    it("renders save button with default text", () => {
        renderForm();
        expect(screen.getByTestId("settings-save-btn-deepseek")).toHaveTextContent("保存");
    });

    it("shows save error when onSave rejects", async () => {
        const onSave = vi.fn<SaveHandler>().mockRejectedValue(new Error("保存失败：网络错误"));
        const user = userEvent.setup();
        renderForm({ onSave });
        await user.click(screen.getByTestId("settings-save-btn-deepseek"));
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("保存失败：网络错误");
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

    it("renders label map rows without a disclosure button under React StrictMode", async () => {
        window.usageboard.connector.getState = vi.fn().mockResolvedValue({
            status: "ready",
            updatedAt: "2026-06-28T00:00:00.000Z",
            items: [
                {
                    provider: "opencode_go",
                    raw_label: "rolling",
                    normalized_label: "滚动",
                },
            ],
        });

        render(
            <StrictMode>
                <SettingsForm
                    instanceId="opencode-go-1"
                    providerId="opencode_go"
                    parameters={[]}
                    values={{}}
                    refreshIntervalSeconds={300}
                    globalIntervalLabel="5 分钟"
                    onSave={vi.fn<SaveHandler>().mockResolvedValue(undefined)}
                    onSaveLabelMap={vi.fn().mockResolvedValue(undefined)}
                />
            </StrictMode>,
        );

        expect(screen.getByText("数据标签映射")).toBeInTheDocument();
        expect(screen.queryByRole("button", { name: "数据标签映射" })).not.toBeInTheDocument();
        expect(await screen.findByDisplayValue("滚动")).toBeInTheDocument();
    });

    it("shows label map loading state by default", () => {
        window.usageboard.connector.getState = vi
            .fn()
            .mockReturnValue(new Promise(() => undefined));

        render(
            <SettingsForm
                instanceId="opencode-go-1"
                providerId="opencode_go"
                parameters={[]}
                values={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={vi.fn<SaveHandler>().mockResolvedValue(undefined)}
                onSaveLabelMap={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        expect(screen.getByText("加载标签数据…")).toBeInTheDocument();
    });

    it("shows label map empty state by default", async () => {
        window.usageboard.connector.getState = vi.fn().mockResolvedValue({
            status: "ready",
            updatedAt: "2026-06-28T00:00:00.000Z",
            items: [],
        });

        render(
            <SettingsForm
                instanceId="opencode-go-1"
                providerId="opencode_go"
                parameters={[]}
                values={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={vi.fn<SaveHandler>().mockResolvedValue(undefined)}
                onSaveLabelMap={vi.fn().mockResolvedValue(undefined)}
            />,
        );

        expect(await screen.findByText("暂无可映射的数据标签")).toBeInTheDocument();
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

    it("skips secret parameter when unchanged from loaded vault value", async () => {
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
        await act(async () => {
            await Promise.resolve();
        });
        await user.click(screen.getByTestId("settings-save-btn-deepseek"));
        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        if (!call) return;
        const [, , secrets] = call;
        expect(secrets).not.toHaveProperty("API_KEY");
    });
});

describe("SettingsForm OAuth device login (t157)", () => {
    function mock_grok_api() {
        return {
            login_start: vi.fn().mockResolvedValue({
                device_code: "dc-grok",
                user_code: "GROK-CODE",
                verification_uri: "https://auth.x.ai/device",
                verification_uri_complete: "https://auth.x.ai/device?user_code=GROK-CODE",
                expires_in: 1800,
                interval: 5,
            }),
            login_poll: vi.fn().mockResolvedValue({ saved: true, token: "grok-token" }),
            login_cancel: vi.fn().mockResolvedValue(undefined),
            login_status: vi
                .fn()
                .mockResolvedValue({ has_token: false, expires_at: null, can_refresh: false }),
            logout: vi.fn().mockResolvedValue({ logged_out: true }),
            refresh: vi.fn().mockResolvedValue({ success: true }),
        };
    }

    function renderOAuthForm(overrides: Record<string, unknown> = {}) {
        const grok = mock_grok_api();
        (window as unknown as { usageboard: unknown }).usageboard = {
            platform: "win32",
            config: {
                getSecrets: vi.fn().mockResolvedValue({ OAUTH_TOKEN: "grok-token" }),
                get: vi.fn(),
                save: vi.fn(),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                export: vi.fn(),
                import: vi.fn(),
            },
            connector: {
                getState: vi.fn().mockResolvedValue({ status: "idle" }),
                list: vi.fn(),
                refresh: vi.fn(),
                refreshAll: vi.fn(),
                snapshot: vi.fn(),
            },
            log: vi.fn(),
            grok,
        };
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        const defaults = {
            instanceId: "grok-1",
            providerId: "grok",
            authMethod: "oauth_device" as const,
            parameters: [
                {
                    name: "OAUTH_TOKEN",
                    label: "OAuth Token",
                    type: "secret" as const,
                    required: true,
                },
            ],
            values: {},
            hasSecrets: {},
            refreshIntervalSeconds: 300,
            globalIntervalLabel: "5 分钟",
            onSave,
        };
        return { ...render(<SettingsForm {...defaults} {...overrides} />), onSave, grok };
    }

    it("renders device login section for grok and hides secret input", async () => {
        renderOAuthForm();
        await waitFor(() => {
            expect(screen.getByTestId("device-login-section-grok-1")).toBeInTheDocument();
        });
        expect(screen.queryByLabelText("OAuth Token")).not.toBeInTheDocument();
    });

    it("calls onSave with token after grok device login succeeds", async () => {
        const { onSave, grok } = renderOAuthForm();
        const user = userEvent.setup();
        await user.click(await screen.findByText("Grok 登录"));
        await waitFor(() => {
            expect(grok.login_start).toHaveBeenCalledTimes(1);
        });
        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        if (!call) return;
        const [, , secrets] = call;
        expect(secrets).toEqual({ OAUTH_TOKEN: "grok-token" });
    });

    it("renders device login section for kimi with authMethod oauth_device", async () => {
        const kimi = {
            login_start: vi.fn().mockResolvedValue({
                device_code: "dc-kimi",
                user_code: "KIMI-CODE",
                verification_uri: "https://auth.kimi.com/device",
                verification_uri_complete: "https://auth.kimi.com/device?user_code=KIMI-CODE",
                expires_in: 1800,
                interval: 5,
            }),
            login_poll: vi.fn().mockResolvedValue({ saved: true, token: "kimi-token" }),
            login_cancel: vi.fn().mockResolvedValue(undefined),
            login_status: vi
                .fn()
                .mockResolvedValue({ has_token: false, expires_at: null, can_refresh: false }),
            logout: vi.fn().mockResolvedValue({ logged_out: true }),
            refresh: vi.fn().mockResolvedValue({ success: true }),
        };
        (window as unknown as { usageboard: unknown }).usageboard = {
            ...(window.usageboard as object),
            kimi,
        };
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        render(
            <SettingsForm
                instanceId="kimi-1"
                providerId="kimi"
                authMethod="oauth_device"
                parameters={[
                    {
                        name: "OAUTH_TOKEN",
                        label: "OAuth Token",
                        type: "secret" as const,
                        required: true,
                    },
                ]}
                values={{}}
                hasSecrets={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={onSave}
            />,
        );
        await waitFor(() => {
            expect(screen.getByTestId("device-login-section-kimi-1")).toBeInTheDocument();
        });
        expect(screen.queryByLabelText("OAuth Token")).not.toBeInTheDocument();
    });
});

describe("SettingsForm web_login editing (t157)", () => {
    let sessionLoginMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        sessionLoginMock = vi.fn().mockResolvedValue({ saved: true, cookie: "captured-cookie" });
        window.usageboard.session = {
            login: sessionLoginMock,
        } as unknown as typeof window.usageboard.session;
    });

    function renderWebLoginForm(overrides: Record<string, unknown> = {}) {
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        const defaults = {
            instanceId: "opencode-go-1",
            providerId: "opencode_go",
            authMethod: "web_login" as const,
            authDescriptor: {
                method: "web_login" as const,
                secret_name: "SESSION_COOKIE",
                login_url: "https://opencode.ai/auth",
            },
            parameters: [
                {
                    name: "SESSION_COOKIE",
                    label: "Cookie",
                    type: "secret" as const,
                    required: true,
                },
            ],
            values: {},
            hasSecrets: {},
            refreshIntervalSeconds: 300,
            globalIntervalLabel: "5 分钟",
            onSave,
        };
        return { ...render(<SettingsForm {...defaults} {...overrides} />), onSave };
    }

    it("renders WebLoginSection for authMethod web_login and hides secret input", () => {
        renderWebLoginForm();
        expect(screen.getByTestId("web-login-section-opencode_go")).toBeInTheDocument();
        expect(screen.queryByLabelText("Cookie")).not.toBeInTheDocument();
    });

    it("calls session.login and saves cookie when web login succeeds", async () => {
        const { onSave } = renderWebLoginForm();
        const user = userEvent.setup();
        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(sessionLoginMock).toHaveBeenCalledWith({
                provider: "opencode_go",
                login_url: "https://opencode.ai/auth",
                cookie_names: ["*"],
                instance_id: "opencode-go-1",
            });
        });
        await waitFor(() => {
            expect(onSave).toHaveBeenCalledTimes(1);
        });
        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        if (!call) return;
        const [, , secrets] = call;
        expect(secrets).toEqual({ SESSION_COOKIE: "captured-cookie" });
    });

    it("does not save when web login returns empty cookie", async () => {
        sessionLoginMock.mockResolvedValue({
            saved: true,
            cookie: "",
        });
        const { onSave } = renderWebLoginForm();
        const user = userEvent.setup();
        await user.click(screen.getByText("网页登录"));

        await waitFor(() => {
            expect(screen.getByText("未捕获到 Cookie，请完成登录后再关闭窗口")).toBeInTheDocument();
        });
        expect(onSave).not.toHaveBeenCalled();
    });
});

describe("SettingsForm session editing (t157)", () => {
    it("renders SessionSection for authMethod session and textarea participates in save", async () => {
        const onSave = vi.fn<SaveHandler>().mockResolvedValue(undefined);
        const user = userEvent.setup();
        render(
            <SettingsForm
                instanceId="mimo-1"
                providerId="mimo"
                authMethod="session"
                parameters={[
                    {
                        name: "SESSION_COOKIE",
                        label: "Cookie",
                        type: "secret" as const,
                        required: true,
                    },
                ]}
                values={{}}
                hasSecrets={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={onSave}
            />,
        );

        expect(screen.getByTestId("session-section-SESSION_COOKIE")).toBeInTheDocument();
        const textarea = screen.getByPlaceholderText(
            "在浏览器登录后，从开发者工具复制完整 Cookie…",
        );
        await user.type(textarea, "manual-cookie-value");
        await user.click(screen.getByTestId("settings-save-btn-mimo-1"));

        const call = onSave.mock.calls[0];
        expect(call).toBeDefined();
        if (!call) return;
        const [, , secrets] = call;
        expect(secrets).toEqual({ SESSION_COOKIE: "manual-cookie-value" });
    });

    it("uses label@zh-Hans when available", () => {
        const params: PluginParameterMetadata[] = [
            {
                name: "LIMIT",
                label: "Amount Limit",
                "label@zh-Hans": "金额上限",
                type: "integer",
                required: false,
            },
        ];
        renderForm({ parameters: params });
        expect(screen.getByText("金额上限")).toBeInTheDocument();
        expect(screen.queryByText("Amount Limit")).not.toBeInTheDocument();
    });

    it("loads vault secret plaintext into the field", async () => {
        const params: PluginParameterMetadata[] = [
            {
                name: "API_KEY",
                label: "API Key",
                type: "secret",
                required: true,
            },
        ];
        renderForm({
            parameters: params,
            hasSecrets: { API_KEY: true },
        });
        await act(async () => {
            await Promise.resolve();
        });
        const input = screen.getByLabelText<HTMLInputElement>("API Key");
        expect(input.value).toBe("sk-loaded-secret");
        expect(input.type).toBe("password");
        expect(input.value).toHaveLength("sk-loaded-secret".length);
    });
});

describe("SettingsForm label-map watch bell (t048)", () => {
    beforeEach(() => {
        window.usageboard.connector.getState = vi.fn().mockResolvedValue({
            status: "ready",
            updatedAt: "2026-06-28T00:00:00.000Z",
            items: [
                {
                    provider: "claude",
                    source: "poll",
                    sourceInstanceId: "inst-1",
                    accountId: "acc-a",
                    accountLabel: "Account A",
                    raw_label: "five_hour",
                    normalized_label: "5小时",
                },
                {
                    provider: "claude",
                    source: "poll",
                    sourceInstanceId: "inst-1",
                    accountId: "acc-b",
                    accountLabel: "Account B",
                    raw_label: "five_hour",
                    normalized_label: "5小时",
                },
                {
                    provider: "claude",
                    source: "poll",
                    sourceInstanceId: "inst-1",
                    accountId: "acc-b",
                    accountLabel: "Account B",
                    raw_label: "seven_day",
                    normalized_label: "一周",
                },
            ],
        });
    });

    async function expand_label_map() {
        const user = userEvent.setup();
        render(
            <SettingsForm
                instanceId="inst-1"
                providerId="claude"
                parameters={[]}
                values={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={vi.fn<SaveHandler>().mockResolvedValue(undefined)}
                onSaveLabelMap={vi.fn().mockResolvedValue(undefined)}
                watchedMetrics={{
                    claude: {
                        "inst-1|acc-a": ["five_hour"],
                        "inst-1|acc-b": ["five_hour"],
                    },
                }}
                onToggleWatched={vi.fn()}
            />,
        );
        await user.click(screen.getByText("数据标签映射"));
        return user;
    }

    it("renders a bell per raw_label when on_toggle_watched is provided", async () => {
        await expand_label_map();
        const bells = screen.getAllByRole("button", { name: "监控该数据标签的即将重置" });
        expect(bells).toHaveLength(2);
    });

    it("does not render bells when on_toggle_watched is absent", async () => {
        const user = userEvent.setup();
        render(
            <SettingsForm
                instanceId="inst-1"
                providerId="claude"
                parameters={[]}
                values={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={vi.fn<SaveHandler>().mockResolvedValue(undefined)}
                onSaveLabelMap={vi.fn().mockResolvedValue(undefined)}
                watchedMetrics={{ claude: { "inst-1|acc-a": ["five_hour"] } }}
            />,
        );
        await user.click(screen.getByText("数据标签映射"));
        expect(
            screen.queryByRole("button", { name: "监控该数据标签的即将重置" }),
        ).not.toBeInTheDocument();
    });

    it("marks the bell aria-pressed=true only when all account_keys are watched", async () => {
        await expand_label_map();
        const bells = screen.getAllByRole("button", { name: "监控该数据标签的即将重置" });
        expect(bells[0]).toHaveAttribute("aria-pressed", "true");
        expect(bells[1]).toHaveAttribute("aria-pressed", "false");
    });

    it("marks aria-pressed=false when only some account_keys are watched (t048 review test f002)", async () => {
        // raw_label "five_hour" spans two account_keys (acc-a, acc-b).
        // Only acc-a is in watchedMetrics -> not every -> aria-pressed=false.
        const user = userEvent.setup();
        render(
            <SettingsForm
                instanceId="inst-1"
                providerId="claude"
                parameters={[]}
                values={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={vi.fn<SaveHandler>().mockResolvedValue(undefined)}
                onSaveLabelMap={vi.fn().mockResolvedValue(undefined)}
                watchedMetrics={{ claude: { "inst-1|acc-a": ["five_hour"] } }}
                onToggleWatched={vi.fn()}
            />,
        );
        await user.click(screen.getByText("数据标签映射"));
        const bells = await screen.findAllByRole("button", { name: "监控该数据标签的即将重置" });
        // five_hour row bell: partial watched -> false
        expect(bells[0]).toHaveAttribute("aria-pressed", "false");
    });

    it("calls on_toggle_watched(raw_label) when bell clicked", async () => {
        const on_toggle_watched = vi.fn();
        const user = userEvent.setup();
        render(
            <SettingsForm
                instanceId="inst-1"
                providerId="claude"
                parameters={[]}
                values={{}}
                refreshIntervalSeconds={300}
                globalIntervalLabel="5 分钟"
                onSave={vi.fn<SaveHandler>().mockResolvedValue(undefined)}
                onSaveLabelMap={vi.fn().mockResolvedValue(undefined)}
                watchedMetrics={{ claude: { "inst-1|acc-a": ["five_hour"] } }}
                onToggleWatched={on_toggle_watched}
            />,
        );
        await user.click(screen.getByText("数据标签映射"));
        const bells = await screen.findAllByRole("button", { name: "监控该数据标签的即将重置" });
        const first = bells[0];
        if (!first) throw new Error("bell not rendered");
        await user.click(first);
        expect(on_toggle_watched).toHaveBeenCalledWith("five_hour");
    });
});

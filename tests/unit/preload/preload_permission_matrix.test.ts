import { describe, expect, it, vi } from "vitest";

import { create_preload_api, create_preload_config } from "../../../src/preload/api_factory";
import type { AppConfiguration } from "../../../src/shared/types/config";
import type { UsageboardApi } from "../../../src/shared/types/ipc";

describe("Preload Permission Matrix & Factory (A95 & A144 / AC-001, AC-002, AC-004)", () => {
    function setup_deps() {
        const full_config_save = vi.fn().mockResolvedValue(undefined);
        const current_config: AppConfiguration = {
            schemaVersion: 2,
            language: "zh-Hans",
            launchAtLogin: false,
            plugins: [{ instanceId: "inst-1" } as never],
            proxy: { url: "http://current-proxy:7890" },
            providerOrder: ["claude"],
        };

        const config_full = {
            get: vi.fn().mockResolvedValue({ config: current_config, hasSecrets: {} }),
            save: full_config_save,
            saveSecrets: vi.fn().mockResolvedValue(undefined),
            getSecrets: vi.fn().mockResolvedValue({}),
            duplicate: vi.fn().mockResolvedValue({ instanceId: "dup" }),
            createInstance: vi.fn().mockResolvedValue({ instanceId: "created" }),
            export: vi.fn().mockResolvedValue({ saved: true }),
            import: vi.fn().mockResolvedValue({ imported: true }),
        } as unknown as UsageboardApi["config"];

        const config_readonly = {
            get: vi.fn().mockResolvedValue({ config: current_config, hasSecrets: {} }),
        };

        const session_settings = {
            login: vi.fn().mockResolvedValue({ success: true }),
            refresh: vi.fn().mockResolvedValue({ success: true }),
        } as unknown as UsageboardApi["session"];

        const session_disabled = {
            login: vi
                .fn()
                .mockRejectedValue(new Error("Session login is only available from settings")),
            refresh: vi
                .fn()
                .mockRejectedValue(new Error("Session refresh is only available from settings")),
        } as unknown as UsageboardApi["session"];

        const grok_bot_settings = {
            login_start: vi.fn().mockResolvedValue({ auth_url: "url", uuid: "u", verifier: "v" }),
            login_poll: vi.fn().mockResolvedValue({ saved: true }),
            login_cancel: vi.fn().mockResolvedValue(undefined),
            logout: vi.fn().mockResolvedValue({ logged_out: true }),
            refresh: vi.fn().mockResolvedValue({ ok: true }),
        } as unknown as UsageboardApi["grok_bot"];

        const grok_bot_readonly = {
            login_start: vi
                .fn()
                .mockRejectedValue(
                    new Error("Grok Bot OAuth login is only available from settings"),
                ),
            login_poll: vi
                .fn()
                .mockRejectedValue(
                    new Error("Grok Bot OAuth login is only available from settings"),
                ),
            login_cancel: vi
                .fn()
                .mockRejectedValue(
                    new Error("Grok Bot OAuth login is only available from settings"),
                ),
            logout: vi
                .fn()
                .mockRejectedValue(
                    new Error("Grok Bot OAuth login is only available from settings"),
                ),
            refresh: vi
                .fn()
                .mockRejectedValue(
                    new Error("Grok Bot OAuth login is only available from settings"),
                ),
        } as unknown as UsageboardApi["grok_bot"];

        const session_history_full = {
            open: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockResolvedValue({ subscribed: true }),
            query: vi.fn().mockResolvedValue({ messages: [] }),
        } as unknown as UsageboardApi["sessionHistory"];

        const session_history_open_only = {
            open: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockResolvedValue({ subscribed: false }),
            query: vi.fn().mockResolvedValue({ messages: [] }),
        } as unknown as UsageboardApi["sessionHistory"];

        const session_history_disabled = {
            open: vi.fn().mockResolvedValue(undefined),
            subscribe: vi.fn().mockResolvedValue({ subscribed: false }),
            query: vi.fn().mockResolvedValue({ messages: [] }),
        } as unknown as UsageboardApi["sessionHistory"];

        const trend_full = {
            get: vi.fn().mockResolvedValue([{ used: 10 }]),
            getBulk: vi.fn().mockResolvedValue({ series: [] }),
        } as unknown as UsageboardApi["trend"];

        const trend_disabled = {
            get: vi.fn().mockResolvedValue([]),
            getBulk: vi.fn().mockResolvedValue({ series: [] }),
        } as unknown as UsageboardApi["trend"];

        const create_api_for_route = (route: string) => {
            const config_for_route = create_preload_config(route, {
                config_full,
                config_readonly,
            });
            return create_preload_api(route, {
                platform: "darwin",
                common_base: {
                    connector: {} as never,
                    plugin: {} as never,
                    event: {} as never,
                    popup: {} as never,
                    main_panel: {} as never,
                    theme: {} as never,
                    settings: {} as never,
                    devPanel: {} as never,
                    window: {} as never,
                    tray: {} as never,
                    auth: {} as never,
                    logs: {} as never,
                    log: vi.fn() as never,
                    tokenStats: {} as never,
                    buildInfo: {} as never,
                },
                config: config_for_route,
                session: {
                    settings: session_settings,
                    disabled: session_disabled,
                },
                grok: {
                    readonly_api: { login_status: vi.fn() },
                    settings_api: { login_status: vi.fn(), login_start: vi.fn() } as never,
                },
                kimi: {
                    readonly_api: { login_status: vi.fn() },
                    settings_api: { login_status: vi.fn(), login_start: vi.fn() } as never,
                },
                grok_bot: {
                    readonly_api: grok_bot_readonly,
                    settings_api: grok_bot_settings,
                },
                trend: {
                    full: trend_full,
                    disabled: trend_disabled,
                },
                sessionHistory: {
                    full: session_history_full,
                    open_only: session_history_open_only,
                    disabled: session_history_disabled,
                },
            });
        };

        return {
            create_api_for_route,
            full_config_save,
            current_config,
            config_full,
            config_readonly,
            grok_bot_settings,
            grok_bot_readonly,
            session_settings,
            session_disabled,
        };
    }

    it("setting window receives full management capabilities", async () => {
        const { create_api_for_route, grok_bot_settings, session_settings, config_full } =
            setup_deps();
        const api = create_api_for_route("setting");

        expect(api.config).toBe(config_full);
        expect(api.session).toBe(session_settings);
        expect(api.grok_bot).toBe(grok_bot_settings);
        await expect(api.session.login({} as never)).resolves.toEqual({ success: true });
        await expect(api.grok_bot.login_start()).resolves.toEqual({
            auth_url: "url",
            uuid: "u",
            verifier: "v",
        });
    });

    it("popup (usage) window receives whitelisted config save and rejects grok_bot login (AC-002, AC-003)", async () => {
        const { create_api_for_route, grok_bot_readonly, session_disabled, full_config_save } =
            setup_deps();
        const api = create_api_for_route("usage");

        expect(api.session).toBe(session_disabled);
        expect(api.grok_bot).toBe(grok_bot_readonly);
        await expect(api.session.login({} as never)).rejects.toThrow(
            "only available from settings",
        );
        await expect(api.grok_bot.login_start()).rejects.toThrow("only available from settings");

        // 真实调用生产函数 create_preload_config 中的 save 实现
        await api.config.save({
            providerOrder: ["claude", "antigravity"],
            plugins: [{ instanceId: "evil_inst" }],
            proxy: { url: "http://evil:9999" },
        } as never);

        expect(full_config_save).toHaveBeenCalledTimes(1);
        const saved_payload = full_config_save.mock.calls[0]?.[0] as Record<string, unknown>;
        expect(saved_payload["providerOrder"]).toEqual(["claude", "antigravity"]);
        // 越权敏感字段被生产逻辑拦截并恢复为当前配置
        expect(saved_payload["plugins"]).toEqual([{ instanceId: "inst-1" }]);
        expect(saved_payload["proxy"]).toEqual({ url: "http://current-proxy:7890" });
    });

    it("tray window receives readonly config and rejects high-privilege methods", async () => {
        const {
            create_api_for_route,
            grok_bot_readonly,
            session_disabled,
            config_full,
            full_config_save,
        } = setup_deps();
        const api = create_api_for_route("tray");

        expect(api.config).not.toBe(config_full);
        expect(api.session).toBe(session_disabled);
        expect(api.grok_bot).toBe(grok_bot_readonly);
        await expect(api.session.login({} as never)).rejects.toThrow(
            "only available from settings",
        );
        await expect(api.grok_bot.login_start()).rejects.toThrow("only available from settings");

        // tray 下 save 为 no-op，安全执行不报错
        await api.config.save({} as never);
        expect(full_config_save).not.toHaveBeenCalled();
    });

    it("session window receives full sessionHistory but readonly config and disabled grok_bot", async () => {
        const { create_api_for_route, grok_bot_readonly, session_disabled } = setup_deps();
        const api = create_api_for_route("session");

        expect(typeof api.sessionHistory.subscribe).toBe("function");
        expect(api.grok_bot).toBe(grok_bot_readonly);
        expect(api.session).toBe(session_disabled);
        await expect(api.grok_bot.login_start()).rejects.toThrow("only available from settings");
    });
});

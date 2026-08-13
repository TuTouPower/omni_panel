import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AddAccountParams } from "../../../../src/renderer/components/AddAccountDialog";
import {
    create_instance_and_save,
    type SavePluginSettings,
} from "../../../../src/renderer/hooks/use_connector_catalog";
import type { AppConfiguration } from "../../../../src/shared/types/config";

const { log_warn } = vi.hoisted(() => ({ log_warn: vi.fn() }));

vi.mock("../../../../src/renderer/views/settings-view/lib", () => ({
    log: { warn: log_warn },
}));

const config: AppConfiguration = {
    schemaVersion: 2,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

function make_params(overrides: Partial<AddAccountParams> = {}): AddAccountParams {
    return {
        vendor_id: "grok",
        manifest_id: "grok",
        account_name: "Grok account",
        auth_method: "oauth_device",
        oauth_source_instance_id: "grok-temp-instance",
        parameter_values: {},
        secrets: {
            OAUTH_TOKEN: "access-token",
            OAUTH_REFRESH_TOKEN: "refresh-token",
            OAUTH_EXPIRES_AT: "1785210000000",
        },
        ...overrides,
    };
}

function install_api(options?: { logout_error?: Error; save_error?: Error }) {
    const create_instance = vi.fn().mockResolvedValue({ instanceId: "real-instance" });
    const get_config = vi.fn().mockResolvedValue({ config });
    const save_config = options?.save_error
        ? vi.fn().mockRejectedValue(options.save_error)
        : vi.fn().mockResolvedValue(undefined);
    const grok_logout = options?.logout_error
        ? vi.fn().mockRejectedValue(options.logout_error)
        : vi.fn().mockResolvedValue({ logged_out: true });
    const kimi_logout = vi.fn().mockResolvedValue({ logged_out: true });
    (window as unknown as { usageboard: unknown }).usageboard = {
        config: {
            createInstance: create_instance,
            get: get_config,
            save: save_config,
        },
        grok: { logout: grok_logout },
        kimi: { logout: kimi_logout },
    };
    return { create_instance, get_config, save_config, grok_logout, kimi_logout };
}

describe("create_instance_and_save", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("saves OAuth secrets to the real instance before clearing the temp instance", async () => {
        const api = install_api();
        const save_plugin_settings = vi.fn().mockResolvedValue(undefined);
        const params = make_params();

        const result = await create_instance_and_save(params, save_plugin_settings);

        expect(result).toEqual({ instanceId: "real-instance", pluginName: "Grok account" });
        expect(save_plugin_settings).toHaveBeenCalledWith(
            "real-instance",
            {},
            params.secrets,
            {},
            0,
            "Grok account",
            true,
            config,
        );
        expect(api.grok_logout).toHaveBeenCalledWith("grok-temp-instance");
        expect(api.create_instance.mock.invocationCallOrder[0]).toBeLessThan(
            save_plugin_settings.mock.invocationCallOrder[0] ?? 0,
        );
        expect(save_plugin_settings.mock.invocationCallOrder[0]).toBeLessThan(
            api.grok_logout.mock.invocationCallOrder[0] ?? 0,
        );
    });

    it("does not clear the temp instance when saving the real instance fails", async () => {
        const api = install_api();
        const save_error = new Error("save failed");
        const save_plugin_settings = vi.fn().mockRejectedValue(save_error);

        await expect(create_instance_and_save(make_params(), save_plugin_settings)).rejects.toBe(
            save_error,
        );

        expect(api.grok_logout).not.toHaveBeenCalled();
    });

    it("removes the created instance from config when a later step fails (t357 AC-001)", async () => {
        const api = install_api();
        // 模拟 createInstance 后 get() 返回含新实例的 config，验证清理 filter 真移除它。
        api.get_config.mockResolvedValue({
            config: {
                ...config,
                plugins: [
                    {
                        instanceId: "real-instance",
                        stateId: "real-state",
                        name: "REAL",
                        enabled: true,
                        executablePath: "",
                        refreshIntervalSeconds: 300,
                        parameterValues: {},
                        endpointOverrides: {},
                    },
                ],
            },
        });
        const save_error = new Error("save failed");
        const save_plugin_settings = vi.fn().mockRejectedValue(save_error);

        await expect(create_instance_and_save(make_params(), save_plugin_settings)).rejects.toThrow(
            "save failed",
        );

        // createInstance 建的 instanceId 须从 config 移除（补偿删除），不残留空账号。
        expect(api.save_config).toHaveBeenCalledTimes(1);
        const saved = api.save_config.mock.calls[0]?.[0] as {
            plugins: { instanceId: string }[];
            removedConnectorIds: string[];
        };
        expect(saved.plugins.every((p) => p.instanceId !== "real-instance")).toBe(true);
        // 清理须写回 removedConnectorIds 墓碑，否则 stale-save 保护会恢复该插件（f001）。
        expect(saved.removedConnectorIds).toContain("grok");
    });

    it("cleans up created instance even when OAuth logout fails (t357 AC-001)", async () => {
        const api = install_api({ logout_error: new Error("logout failed") });
        const save_plugin_settings = vi.fn().mockResolvedValue(undefined);

        await expect(create_instance_and_save(make_params(), save_plugin_settings)).rejects.toThrow(
            "logout failed",
        );

        expect(api.save_config).toHaveBeenCalledTimes(1);
        const saved = api.save_config.mock.calls[0]?.[0] as { plugins: { instanceId: string }[] };
        expect(saved.plugins.every((p) => p.instanceId !== "real-instance")).toBe(true);
    });

    it("logs and rethrows when cleanup save itself fails (t357 AC-001)", async () => {
        install_api({ save_error: new Error("cleanup failed") });
        const save_error = new Error("save failed");
        const save_plugin_settings = vi.fn().mockRejectedValue(save_error);

        await expect(create_instance_and_save(make_params(), save_plugin_settings)).rejects.toThrow(
            "save failed",
        );

        expect(log_warn).toHaveBeenCalledWith(
            "add account 失败后清理实例也失败",
            expect.any(Error),
        );
    });

    it("does not call OAuth logout for non-OAuth accounts", async () => {
        const api = install_api();
        const save_plugin_settings = vi.fn().mockResolvedValue(undefined);

        const params = make_params({
            auth_method: "apikey",
            secrets: { API_KEY: "api-key" },
        });
        delete params.oauth_source_instance_id;
        await create_instance_and_save(params, save_plugin_settings);

        expect(api.grok_logout).not.toHaveBeenCalled();
        expect(api.kimi_logout).not.toHaveBeenCalled();
    });

    it("reports cleanup failure after preserving the saved real instance", async () => {
        const api = install_api({ logout_error: new Error("cleanup failed") });
        const save_plugin_settings: SavePluginSettings = vi.fn().mockResolvedValue(undefined);

        await expect(create_instance_and_save(make_params(), save_plugin_settings)).rejects.toThrow(
            "cleanup failed",
        );

        expect(api.create_instance).toHaveBeenCalledTimes(1);
        expect(save_plugin_settings).toHaveBeenCalledTimes(1);
        expect(api.grok_logout).toHaveBeenCalledWith("grok-temp-instance");
        expect(log_warn).not.toHaveBeenCalled();
    });

    it("clears Kimi temporary credentials through the Kimi namespace", async () => {
        const api = install_api();
        const save_plugin_settings = vi.fn().mockResolvedValue(undefined);

        await create_instance_and_save(
            make_params({
                vendor_id: "kimi",
                manifest_id: "kimi",
                oauth_source_instance_id: "kimi-temp-instance",
            }),
            save_plugin_settings,
        );

        expect(api.kimi_logout).toHaveBeenCalledWith("kimi-temp-instance");
        expect(api.grok_logout).not.toHaveBeenCalled();
    });
});

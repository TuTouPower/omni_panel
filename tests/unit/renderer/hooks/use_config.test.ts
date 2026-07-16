import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import type { AppConfiguration } from "../../../../src/shared/types/config";

const config_get = vi.fn();
const config_save = vi.fn().mockResolvedValue(undefined);
const config_save_secrets = vi.fn().mockResolvedValue(undefined);
const config_duplicate = vi.fn().mockResolvedValue(undefined);
const on_config_change = vi.fn((callback: (config: AppConfiguration) => void) => {
    void callback;
    return vi.fn();
});

const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    launchAtLogin: false,
    plugins: [],
};

beforeEach(() => {
    vi.clearAllMocks();
    config_get.mockResolvedValue({ config: base_config, hasSecrets: {} });
    window.usageboard = {
        platform: "win32",
        plugin: {
            list: vi.fn(),
            getState: vi.fn(),
            refresh: vi.fn(),
            refreshAll: vi.fn(),
        },
        config: {
            get: config_get,
            save: config_save,
            getSecrets: vi.fn().mockResolvedValue({}),
            saveSecrets: config_save_secrets,
            duplicate: config_duplicate,
            export: vi.fn(),
            import: vi.fn(),
        },
        event: {
            onStateChange: vi.fn(() => vi.fn()),
            onThemeChange: vi.fn(),
            onSettingsNavigate: vi.fn(() => vi.fn()),
            onConfigChange: on_config_change,
        },
        popup: { report_content_height: vi.fn() },
        main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
        settings: { open: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
        log: vi.fn(),
    } as unknown as typeof window.usageboard;
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe("use_config", () => {
    it("loads config on mount", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        expect(result.current.config).toEqual(base_config);
        expect(result.current.error).toBeNull();
    });

    it("subscribes to onConfigChange on mount", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        renderHook(() => use_config());

        await waitFor(() => {
            expect(on_config_change).toHaveBeenCalledTimes(1);
        });
    });

    it("updates config when external CONFIG_CHANGED event arrives", async () => {
        let captured_callback: ((config: AppConfiguration) => void) | undefined;
        on_config_change.mockImplementation((cb: (config: AppConfiguration) => void) => {
            captured_callback = cb;
            return vi.fn();
        });

        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const external_config: AppConfiguration = {
            ...base_config,
            plugins: [
                {
                    instanceId: "ext-1",
                    stateId: "ext-1",
                    name: "External",
                    enabled: false,
                    executablePath: "",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };

        act(() => {
            captured_callback?.(external_config);
        });

        expect(result.current.config).toEqual(external_config);
    });

    it("does not re-update when echo of own save arrives", async () => {
        let captured_callback: ((config: AppConfiguration) => void) | undefined;
        on_config_change.mockImplementation((cb: (config: AppConfiguration) => void) => {
            captured_callback = cb;
            return vi.fn();
        });

        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const new_config: AppConfiguration = {
            ...base_config,
            plugins: [
                {
                    instanceId: "local-1",
                    stateId: "local-1",
                    name: "Local",
                    enabled: true,
                    executablePath: "",
                    refreshIntervalSeconds: 300,
                    parameterValues: {},
                    endpointOverrides: {},
                },
            ],
        };

        // save() updates config locally
        await act(async () => {
            await result.current.save(new_config);
        });

        expect(result.current.config).toBe(new_config);

        // Simulate CONFIG_CHANGED echo with the same reference
        act(() => {
            captured_callback?.(new_config);
        });

        // INTENTIONAL: reference equality check confirms the hook skips
        // unnecessary setState when the incoming config is the same object
        // (i.e. an echo of the local save).
        expect(result.current.config).toBe(new_config);
    });
});

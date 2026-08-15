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

    it("t390 f001: 外部广播后 save 失败回滚到广播值（非过期 base）", async () => {
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
        expect(result.current.config).toEqual(base_config);

        // 外部窗口广播新配置（已写盘）。
        const external_config: AppConfiguration = { ...base_config, language: "en" };
        act(() => {
            captured_callback?.(external_config);
        });
        expect(result.current.config).toEqual(external_config);

        // 本窗口 save 失败：应回滚到广播值（最近确认值），而非过期 base。
        config_save.mockRejectedValueOnce(new Error("disk full"));
        const attempted: AppConfiguration = { ...base_config, theme: "dark" };
        await act(async () => {
            await expect(result.current.save(attempted)).rejects.toThrow("disk full");
        });
        expect(result.current.config).toEqual(external_config);
    });

    it("t390 f002: 成功 save 后失败回滚到最近成功值（confirmed 推进）", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.config).toEqual(base_config);

        // 成功 save A。
        config_save.mockResolvedValueOnce(undefined);
        const a: AppConfiguration = { ...base_config, language: "en" };
        await act(async () => {
            await result.current.save(a);
        });
        expect(result.current.config).toEqual(a);

        // 后续 save B 失败：应回滚到最近确认值 A，而非过期 base。
        config_save.mockRejectedValueOnce(new Error("disk full"));
        const b: AppConfiguration = { ...base_config, theme: "dark" };
        await act(async () => {
            await expect(result.current.save(b)).rejects.toThrow("disk full");
        });
        expect(result.current.config).toEqual(a);
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

    it("keeps config reference when echo arrives as a deep-equal but different object (t153)", async () => {
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

        const before = result.current.config;
        expect(before).not.toBeNull();

        // IPC broadcasts are deserialized: the echo of our own state always
        // arrives as a fresh object, never the same reference.
        const echo = JSON.parse(JSON.stringify(before)) as AppConfiguration;
        act(() => {
            captured_callback?.(echo);
        });

        expect(result.current.config).toBe(before);
    });

    it("rolls back optimistic config update when save fails (t356 AC-002)", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        const confirmed = result.current.config;
        expect(confirmed).toEqual(base_config);

        // save 失败：乐观更新后的 config 应回滚到 base_config（内存与磁盘一致）。
        config_save.mockRejectedValueOnce(new Error("disk full"));
        const failed: AppConfiguration = {
            ...base_config,
            language: "en",
        };
        await act(async () => {
            await expect(result.current.save(failed)).rejects.toThrow("disk full");
        });

        expect(result.current.config).toEqual(base_config);
    });

    it("rolls back update_config optimistic update when save fails (t356 AC-002)", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        config_save.mockRejectedValueOnce(new Error("disk full"));
        await act(async () => {
            result.current.update_config((prev) => ({ ...prev, language: "en" }));
            // update_config 内部链式，等其 settle
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(result.current.config).toEqual(base_config);
    });

    it("t390 AC-001: 连续两次 save 失败回滚到最近确认值（base），非前一乐观值", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.config).toEqual(base_config);

        config_save.mockRejectedValue(new Error("disk full"));
        const a: AppConfiguration = { ...base_config, language: "en" };
        const b: AppConfiguration = { ...base_config, theme: "dark" };
        await act(async () => {
            const pa = result.current.save(a);
            const pb = result.current.save(b);
            await Promise.allSettled([pa, pb]);
        });

        // 修复前：B 失败回滚到 A（乐观前值），终态 A ≠ 磁盘 base 漂移。
        // 修复后：回滚到最近确认值 base。
        expect(result.current.config).toEqual(base_config);
    });

    it("t390 AC-003: update_config 连续两次失败同样回滚到最近确认值", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.config).toEqual(base_config);

        config_save.mockRejectedValue(new Error("disk full"));
        await act(async () => {
            result.current.update_config((prev) => ({ ...prev, language: "en" }));
            result.current.update_config((prev) => ({ ...prev, theme: "dark" }));
            await new Promise((r) => setTimeout(r, 0));
        });

        expect(result.current.config).toEqual(base_config);
    });

    it("t390 f002: update_config 成功推进确认点，后续 save 失败回滚到 update_config 成功值", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.config).toEqual(base_config);

        // update_config 成功（写盘）。
        config_save.mockResolvedValueOnce(undefined);
        await act(async () => {
            result.current.update_config((prev) => ({ ...prev, language: "en" }));
            await new Promise((r) => setTimeout(r, 0));
        });
        const confirmed = result.current.config;
        expect(confirmed).not.toEqual(base_config);

        // 后续 save 失败：应回滚到 update_config 成功值（最近确认），而非 base。
        config_save.mockRejectedValueOnce(new Error("disk full"));
        const attempted: AppConfiguration = { ...base_config, theme: "dark" };
        await act(async () => {
            await expect(result.current.save(attempted)).rejects.toThrow("disk full");
        });
        expect(result.current.config).toEqual(confirmed);
    });

    it("t390 f003: reload 后 save 失败回滚到 reload 值（最近确认）", async () => {
        const { use_config } = await import("../../../../src/renderer/hooks/use-config");
        const { result } = renderHook(() => use_config());
        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });
        expect(result.current.config).toEqual(base_config);

        // reload 从磁盘拿新值。
        const external_config: AppConfiguration = { ...base_config, language: "en" };
        config_get.mockResolvedValueOnce({ config: external_config, hasSecrets: {} });
        await act(async () => {
            await result.current.reload();
        });
        expect(result.current.config).toEqual(external_config);

        // 后续 save 失败：回滚到 reload 值（最近确认），而非过期 base。
        config_save.mockRejectedValueOnce(new Error("disk full"));
        const attempted: AppConfiguration = { ...base_config, theme: "dark" };
        await act(async () => {
            await expect(result.current.save(attempted)).rejects.toThrow("disk full");
        });
        expect(result.current.config).toEqual(external_config);
    });
});

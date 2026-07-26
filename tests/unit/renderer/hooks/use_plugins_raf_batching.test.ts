import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../../../src/shared/types/ipc";

const connector_list = vi.fn();
const on_state_change = vi.fn(
    (callback: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
        void callback;
        return vi.fn();
    },
);

function make_connector(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
    return {
        instanceId: "ds-1",
        sourceInstanceId: "ds-1",
        stateId: "ds-1",
        name: "deepseek",
        displayName: "DeepSeek",
        enabled: true,
        source: "poll",
        supportedProviders: ["deepseek"],
        activeProviders: ["deepseek"],
        metadata: null,
        snapshot: { status: "idle" },
        ...overrides,
    };
}

beforeEach(() => {
    vi.clearAllMocks();
    connector_list.mockResolvedValue([
        make_connector({ instanceId: "ds-1", name: "deepseek" }),
        make_connector({ instanceId: "glm-1", name: "glm" }),
    ]);
    window.usageboard = {
        platform: "win32",
        connector: {
            list: connector_list,
            catalog: vi.fn(),
            getState: vi.fn(),
            refresh: vi.fn(),
            refreshAll: vi.fn(),
            snapshot: vi.fn(),
        },
        plugin: {
            list: vi.fn(),
            getState: vi.fn(),
            refresh: vi.fn(),
            refreshAll: vi.fn(),
        },
        config: {
            get: vi.fn().mockResolvedValue({ config: {}, hasSecrets: {} }),
            save: vi.fn().mockResolvedValue(undefined),
            getSecrets: vi.fn().mockResolvedValue({}),
            saveSecrets: vi.fn(),
            duplicate: vi.fn(),
            export: vi.fn(),
            import: vi.fn(),
        },
        event: {
            onStateChange: on_state_change,
            onThemeChange: vi.fn(),
            onSettingsNavigate: vi.fn(() => vi.fn()),
            onConfigChange: vi.fn(() => vi.fn()),
        },
        popup: { report_content_height: vi.fn() },
        main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
        settings: { open: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
        log: vi.fn(),
    } as unknown as typeof window.usageboard;
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("use_plugins rAF batching", () => {
    it("batches multiple state-change events in the same frame into one setPlugins", async () => {
        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        let raf_callback: FrameRequestCallback | undefined;
        let raf_id = 0;
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            raf_callback = cb;
            return ++raf_id;
        });
        vi.stubGlobal("cancelAnimationFrame", () => {
            raf_callback = undefined;
        });

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;

        act(() => {
            captured_callback?.("ds-1", {
                status: "ready",
                items: [],
                updatedAt: "2026-07-26T10:00:00Z",
            });
            captured_callback?.("glm-1", {
                status: "ready",
                items: [],
                updatedAt: "2026-07-26T10:00:00Z",
            });
        });

        // Before rAF fires, plugins are still the old reference.
        expect(result.current.plugins).toBe(prev_plugins);

        act(() => {
            raf_callback?.(performance.now());
        });

        expect(result.current.plugins).not.toBe(prev_plugins);
        expect(result.current.plugins[0]?.snapshot.status).toBe("ready");
        expect(result.current.plugins[1]?.snapshot.status).toBe("ready");
    });

    it("cancels pending rAF on unmount", async () => {
        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        let raf_callback: FrameRequestCallback | undefined;
        let raf_id = 0;
        let cancelled_id: number | undefined;
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            raf_callback = cb;
            return ++raf_id;
        });
        vi.stubGlobal("cancelAnimationFrame", (id: number) => {
            cancelled_id = id;
            raf_callback = undefined;
        });

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result, unmount } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        act(() => {
            captured_callback?.("ds-1", {
                status: "ready",
                items: [],
                updatedAt: "2026-07-26T10:00:00Z",
            });
        });

        expect(raf_callback).toBeDefined();
        const scheduled_id = raf_id;

        unmount();

        expect(cancelled_id).toBe(scheduled_id);
        expect(raf_callback).toBeUndefined();
    });

    it("falls back synchronously when requestAnimationFrame is unavailable", async () => {
        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        vi.stubGlobal("requestAnimationFrame", undefined);
        vi.stubGlobal("cancelAnimationFrame", undefined);

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;

        act(() => {
            captured_callback?.("ds-1", {
                status: "ready",
                items: [],
                updatedAt: "2026-07-26T10:00:00Z",
            });
        });

        expect(result.current.plugins).not.toBe(prev_plugins);
        expect(result.current.plugins[0]?.snapshot.status).toBe("ready");
    });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../../../src/shared/types/ipc";
import type { MetricRecord, PluginChart } from "../../../../src/shared/schemas/plugin-output";

const connector_list = vi.fn();

function make_item(overrides: Partial<MetricRecord> = {}): MetricRecord {
    return {
        id: "i1",
        provider: "deepseek",
        source: "poll",
        sourceInstanceId: "ds-1",
        accountId: "acc1",
        accountLabel: "A1",
        raw_label: "",
        normalized_label: "Tokens",
        name: "Tokens",
        used: 100,
        limit: 1000,
        displayStyle: "ratio",
        resetAt: null,
        status: "normal",
        observedAt: 1748858400000,
        stale: false,
        ...overrides,
    };
}

function make_chart(overrides: Partial<PluginChart> = {}): PluginChart {
    return {
        kind: "line",
        period: "day",
        bucketUnit: "day",
        buckets: [
            {
                id: "b1",
                label: "2026-07-26",
                segments: [{ model: "default", tokens: 100 }],
            },
        ],
        message: null,
        ...overrides,
    };
}
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
    connector_list.mockResolvedValue([make_connector()]);
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

beforeEach(() => {
    // use-plugins batches state-change updates via requestAnimationFrame.
    // In jsdom the real rAF never fires synchronously, so flush it
    // immediately to keep these synchronous assertions valid.
    let raf_id = 0;
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
        cb(performance.now());
        return ++raf_id;
    });
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
});

describe("use_plugins", () => {
    it("keeps plugins array reference when snapshot value is unchanged", async () => {
        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;
        const prev_snapshot = result.current.plugins[0]?.snapshot;
        expect(prev_snapshot).toEqual({ status: "idle" });

        act(() => {
            captured_callback?.("ds-1", { status: "idle" });
        });

        expect(result.current.plugins).toBe(prev_plugins);
        expect(result.current.plugins[0]?.snapshot).toBe(prev_snapshot);
    });

    it("updates plugins when snapshot value changes", async () => {
        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

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

    it("keeps reference when items array is equal by value but different reference", async () => {
        const item = make_item();
        connector_list.mockResolvedValue([
            make_connector({
                snapshot: {
                    status: "ready",
                    items: [item],
                    updatedAt: "2026-07-26T10:00:00Z",
                },
            }),
        ]);

        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;

        act(() => {
            captured_callback?.("ds-1", {
                status: "ready",
                items: [make_item()],
                updatedAt: "2026-07-26T10:00:00Z",
            });
        });

        expect(result.current.plugins).toBe(prev_plugins);
    });

    it("updates when items content changes", async () => {
        const item = make_item();
        connector_list.mockResolvedValue([
            make_connector({
                snapshot: {
                    status: "ready",
                    items: [item],
                    updatedAt: "2026-07-26T10:00:00Z",
                },
            }),
        ]);

        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;

        act(() => {
            captured_callback?.("ds-1", {
                status: "ready",
                items: [make_item({ used: 200 })],
                updatedAt: "2026-07-26T10:00:00Z",
            });
        });

        expect(result.current.plugins).not.toBe(prev_plugins);
        const snapshot = result.current.plugins[0]?.snapshot;
        expect(snapshot?.status).toBe("ready");
        expect(
            (snapshot as Extract<ConnectorSnapshotDTO, { status: "ready" }>).items[0]?.used,
        ).toBe(200);
    });

    it("does not affect other instances when one snapshot changes", async () => {
        connector_list.mockResolvedValue([
            make_connector({
                instanceId: "ds-1",
                sourceInstanceId: "ds-1",
                stateId: "ds-1",
                name: "deepseek",
            }),
            make_connector({
                instanceId: "glm-1",
                sourceInstanceId: "glm-1",
                stateId: "glm-1",
                name: "glm",
            }),
        ]);

        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;
        const prev_glm = result.current.plugins.find((p) => p.instanceId === "glm-1");

        act(() => {
            captured_callback?.("ds-1", {
                status: "ready",
                items: [],
                updatedAt: "2026-07-26T10:00:00Z",
            });
        });

        expect(result.current.plugins).not.toBe(prev_plugins);
        expect(result.current.plugins.find((p) => p.instanceId === "glm-1")).toBe(prev_glm);
    });

    it("short-circuits on reference equality without calling snapshot_equal", async () => {
        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;
        const connector = result.current.plugins[0];
        if (!connector) throw new Error("missing connector");
        const prev_snapshot = connector.snapshot;

        act(() => {
            captured_callback?.("ds-1", prev_snapshot);
        });

        expect(result.current.plugins).toBe(prev_plugins);
        expect(result.current.plugins[0]?.snapshot).toBe(prev_snapshot);
    });

    it("keeps reference when chart value is unchanged but reference differs", async () => {
        const chart = make_chart();
        connector_list.mockResolvedValue([
            make_connector({
                snapshot: {
                    status: "ready",
                    items: [],
                    updatedAt: "2026-07-26T10:00:00Z",
                    chart,
                },
            }),
        ]);

        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

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
                chart: make_chart(),
            });
        });

        expect(result.current.plugins).toBe(prev_plugins);
    });

    it("updates when badge appears", async () => {
        connector_list.mockResolvedValue([
            make_connector({
                snapshot: {
                    status: "ready",
                    items: [],
                    updatedAt: "2026-07-26T10:00:00Z",
                },
            }),
        ]);

        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

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
                badge: "1",
            });
        });

        expect(result.current.plugins).not.toBe(prev_plugins);
        expect(
            (
                result.current.plugins[0]?.snapshot as Extract<
                    ConnectorSnapshotDTO,
                    { status: "ready" }
                >
            ).badge,
        ).toBe("1");
    });

    it("keeps use_popup_derived memo references when snapshot value is unchanged", async () => {
        let captured_callback:
            | ((instanceId: string, state: ConnectorSnapshotDTO) => void)
            | undefined;
        on_state_change.mockImplementation(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                captured_callback = cb;
                return vi.fn();
            },
        );

        const [{ use_plugins }, { use_popup_derived }] = await Promise.all([
            import("../../../../src/renderer/hooks/use-plugins"),
            import("../../../../src/renderer/hooks/use_popup_derived"),
        ]);

        function use_combined() {
            const plugins_result = use_plugins();
            const derived = use_popup_derived({
                plugins: plugins_result.plugins,
                account_overrides: undefined,
                account_labels: undefined,
                upcoming_reset_threshold_percent: null,
                provider_order: [],
                active_tab: "overview",
                account_orders: {},
            });
            return { plugins: plugins_result, derived };
        }

        const { result } = renderHook(() => use_combined());

        await waitFor(() => {
            expect(result.current.plugins.loading).toBe(false);
        });

        const prev_raw_groups = result.current.derived.rawGroups;
        const prev_visible_providers = result.current.derived.visibleProviders;
        const prev_provider_errors = result.current.derived.providerErrors;

        act(() => {
            captured_callback?.("ds-1", { status: "idle" });
        });

        expect(result.current.derived.rawGroups).toBe(prev_raw_groups);
        expect(result.current.derived.visibleProviders).toBe(prev_visible_providers);
        expect(result.current.derived.providerErrors).toBe(prev_provider_errors);
    });
});

describe("use_plugins reload identity (t153)", () => {
    it("keeps plugins reference when reload returns a deep-equal list", async () => {
        connector_list.mockImplementation(() => Promise.resolve([make_connector()]));

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;

        await act(async () => {
            await result.current.reload();
        });

        expect(connector_list).toHaveBeenCalledTimes(2);
        expect(result.current.plugins).toBe(prev_plugins);
    });

    it("updates plugins when reload returns a structurally different list", async () => {
        let enabled = true;
        connector_list.mockImplementation(() => Promise.resolve([make_connector({ enabled })]));

        const { use_plugins } = await import("../../../../src/renderer/hooks/use-plugins");
        const { result } = renderHook(() => use_plugins());

        await waitFor(() => {
            expect(result.current.loading).toBe(false);
        });

        const prev_plugins = result.current.plugins;
        enabled = false;

        await act(async () => {
            await result.current.reload();
        });

        expect(result.current.plugins).not.toBe(prev_plugins);
        expect(result.current.plugins[0]?.enabled).toBe(false);
    });
});

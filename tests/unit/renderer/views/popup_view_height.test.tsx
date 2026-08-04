import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type {
    ConnectorInfo,
    ConnectorSnapshotDTO,
    PopupContentHeightReport,
} from "../../../../src/shared/types/ipc";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

function find_live_button(name: RegExp): HTMLElement {
    const btn = screen
        .getAllByRole("button", { name })
        .find((b) => !b.closest('[aria-hidden="true"]'));
    if (!btn) throw new Error(`live button not found: ${String(name)}`);
    return btn;
}

class FakeResizeObserver {
    private static instances: FakeResizeObserver[] = [];
    private callback: () => void;
    private targets: Element[] = [];

    constructor(callback: ResizeObserverCallback) {
        this.callback = () => {
            callback([], this);
        };
        FakeResizeObserver.instances.push(this);
    }
    observe(target: Element) {
        this.targets.push(target);
    }
    unobserve() {
        // ignore
    }
    disconnect() {
        this.targets = [];
    }
    static fire_all() {
        for (const o of FakeResizeObserver.instances) {
            o.callback();
        }
    }
    static reset() {
        FakeResizeObserver.instances = [];
    }
}

function connector(overrides: Partial<ConnectorInfo> = {}): ConnectorInfo {
    const source = overrides.source ?? "gateway";
    const supportedProviders = overrides.supportedProviders ?? ["claude"];
    const activeProviders = overrides.activeProviders ?? supportedProviders;
    return {
        instanceId: overrides.instanceId ?? `${source}-connector`,
        sourceInstanceId: overrides.sourceInstanceId ?? `${source}-main`,
        stateId: overrides.stateId ?? `${source}-state`,
        name: overrides.name ?? `${source}-name`,
        displayName: overrides.displayName ?? overrides.name ?? `${source}-name`,
        enabled: overrides.enabled ?? true,
        source,
        supportedProviders,
        activeProviders,
        metadata: overrides.metadata ?? null,
        snapshot: overrides.snapshot ?? {
            status: "ready",
            updatedAt: "2026-01-01T00:00:00Z",
            items: [],
        },
    };
}

const claude_with_accounts = connector({
    source: "gateway",
    sourceInstanceId: "cpa-main",
    supportedProviders: ["claude"],
    activeProviders: ["claude"],
    snapshot: {
        status: "ready",
        updatedAt: "2026-01-01T12:00:00Z",
        items: [
            {
                id: "claude-pro-a",
                provider: "claude",
                source: "gateway",
                sourceInstanceId: "cpa-main",
                accountId: "acc-a",
                accountLabel: "Account A",
                raw_label: "window-a",
                normalized_label: "Window A",
                used: 10,
                limit: 100,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
                observedAt: 1735689600000,
                stale: false,
            },
            {
                id: "claude-pro-b",
                provider: "claude",
                source: "gateway",
                sourceInstanceId: "cpa-main",
                accountId: "acc-b",
                accountLabel: "Account B",
                raw_label: "window-b",
                normalized_label: "Window B",
                used: 20,
                limit: 200,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
                observedAt: 1735689600000,
                stale: false,
            },
        ],
    },
});

const plugin_list = vi.fn<() => Promise<ConnectorInfo[]>>();
const plugin_refresh = vi.fn().mockResolvedValue(undefined);
const plugin_refresh_all = vi.fn().mockResolvedValue(undefined);
const report_height = vi.fn<(payload: PopupContentHeightReport) => void>();

describe("PopupView collapse + height report", () => {
    afterEach(() => {
        // Restore the rAF stub so it doesn't leak into sibling test files
        // sharing the same worker (use_plugins relies on a sync stub).
        vi.unstubAllGlobals();
    });

    beforeEach(() => {
        vi.clearAllMocks();
        FakeResizeObserver.reset();
        (globalThis as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;
        // use-plugins batches state-change updates via requestAnimationFrame.
        // Stub it to fire on a macrotask so the flush lands deterministically
        // after the act() that pushed the state (a synchronous stub returns a
        // non-undefined id that sticks in `raf_handle`, silently dropping later
        // pushes — see use_plugins' schedule dedup).
        vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
            setTimeout(() => {
                cb(performance.now());
            }, 0);
            return 1;
        });
        vi.stubGlobal("cancelAnimationFrame", () => undefined);
        plugin_list.mockResolvedValue([claude_with_accounts]);
        window.usageboard = {
            platform: "win32",
            plugin: {
                list: plugin_list,
                getState: vi.fn(),
                refresh: plugin_refresh,
                refreshAll: plugin_refresh_all,
            },
            connector: {
                list: plugin_list,
                catalog: vi.fn().mockResolvedValue([]),
                getState: vi.fn(),
                refresh: plugin_refresh,
                refreshAll: plugin_refresh_all,
                snapshot: vi.fn().mockResolvedValue({}),
            },
            config: {
                get: vi.fn().mockResolvedValue({
                    config: {
                        schemaVersion: 1,
                        language: "zh-Hans",
                        plugins: [],
                        launchAtLogin: false,
                    },
                    hasSecrets: {},
                }),
                save: vi.fn().mockResolvedValue(undefined),
                getSecrets: vi.fn().mockResolvedValue({}),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                createInstance: vi.fn().mockResolvedValue({ instanceId: "new" }),
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(() => vi.fn()),
                onThemeChange: vi.fn(),
                onSettingsNavigate: vi.fn(() => vi.fn()),
            },
            popup: {
                report_content_height: report_height,
            },
            main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
            settings: {
                open: vi.fn(),
                minimize: vi.fn(),
                maximize: vi.fn(),
                close: vi.fn(),
                openConnectorsDir: vi.fn(),
            },
            theme: { set: vi.fn() },
            tray: {
                open_panel: vi.fn(),
                refresh_all: vi.fn(),
                toggle_pause: vi.fn(),
                toggle_autostart: vi.fn(),
                open_settings: vi.fn(),
                open_web: vi.fn(),
                check_update: vi.fn(),
                survey: vi.fn(),
                sponsor: vi.fn(),
                restart: vi.fn(),
                quit: vi.fn(),
                hide: vi.fn(),
                report_menu_size: vi.fn(),
                on_pause_state: vi.fn(() => vi.fn()),
                on_autostart_state: vi.fn(() => vi.fn()),
            },
            auth: { cookieLogin: vi.fn() },
            session: { login: vi.fn(), refresh: vi.fn() },
            grok: {
                login_start: vi.fn(),
                login_poll: vi.fn(),
                login_status: vi.fn(),
                logout: vi.fn(),
                refresh: vi.fn(),
            },
            kimi: {
                login_start: vi.fn(),
                login_poll: vi.fn(),
                login_cancel: vi.fn(),
                login_status: vi.fn(),
                logout: vi.fn(),
                refresh: vi.fn(),
            },
            tokenStats: {
                open: vi.fn(),
                getBuckets: vi.fn().mockResolvedValue([]),
                getSessions: vi.fn().mockResolvedValue([]),
                getRecords: vi.fn().mockResolvedValue([]),
                getHeatmap: vi.fn().mockResolvedValue([]),
                getHourBuckets: vi.fn().mockResolvedValue([]),
                getRangeRollup: vi.fn().mockResolvedValue([]),
                getDashboard: vi.fn(),
                getStatus: vi.fn().mockResolvedValue({ running: false, last_updated: null }),
                onUpdated: vi.fn(() => vi.fn()),
            },
            trend: {
                get: vi.fn().mockResolvedValue([]),
                getBulk: vi.fn().mockResolvedValue({ series: [] }),
            },
            logs: { export: vi.fn() },
            log: vi.fn(),
            buildInfo: {
                get: vi.fn().mockResolvedValue({ version: "1.1.0", branch: "dev", commit: "dev" }),
            },
        };
    });

    it("renders account cards expanded by default", async () => {
        render(<PopupView />);

        // Switch to Claude tab to see account list
        const claude_tab = await screen.findByRole("button", { name: /^Claude$/ });
        fireEvent.click(claude_tab);

        await waitFor(() => {
            // both accounts visible at least once
            expect(screen.getAllByText("Account A").length).toBeGreaterThan(0);
            expect(screen.getAllByText("Account B").length).toBeGreaterThan(0);
        });

        // Live (non-aria-hidden) toggles in expand state read "折叠"
        const live_a_toggle = screen
            .getAllByRole("button", { name: /^折叠 Account A$/ })
            .find((b) => !b.closest('[aria-hidden="true"]'));
        const live_b_toggle = screen
            .getAllByRole("button", { name: /^折叠 Account B$/ })
            .find((b) => !b.closest('[aria-hidden="true"]'));
        expect(live_a_toggle).toBeDefined();
        expect(live_b_toggle).toBeDefined();
    });

    it("collapses an account when its toggle is clicked, hiding details", async () => {
        render(<PopupView />);

        fireEvent.click(await screen.findByRole("button", { name: /^Claude$/ }));
        await waitFor(() => {
            expect(screen.getAllByText("Account A").length).toBeGreaterThan(0);
        });

        const live_collapse_a = find_live_button(/^折叠 Account A$/);
        fireEvent.click(live_collapse_a);

        await waitFor(() => {
            const live_expand_a = screen
                .getAllByRole("button", { name: /^展开 Account A$/ })
                .find((b) => !b.closest('[aria-hidden="true"]'));
            expect(live_expand_a).toBeDefined();
        });

        const live_expand_a = find_live_button(/^展开 Account A$/);
        const account_a_card = live_expand_a.closest(".card");
        expect(account_a_card?.querySelector(".bars")).toBeNull();

        const live_b_card = screen
            .getAllByRole("button", { name: /^折叠 Account B$/ })
            .find((b) => !b.closest('[aria-hidden="true"]'))
            ?.closest(".card");
        expect(live_b_card?.querySelector(".bars")).not.toBeNull();
    });

    it("preserves collapse state when switching tabs without structure change", async () => {
        render(<PopupView />);

        fireEvent.click(await screen.findByRole("button", { name: /^Claude$/ }));
        await waitFor(() => {
            expect(screen.getAllByText("Account A").length).toBeGreaterThan(0);
        });
        const collapse_a = find_live_button(/^折叠 Account A$/);
        fireEvent.click(collapse_a);

        await waitFor(() => {
            const expand_a = screen
                .getAllByRole("button", { name: /^展开 Account A$/ })
                .find((b) => !b.closest('[aria-hidden="true"]'));
            expect(expand_a).toBeDefined();
        });

        // Switch to overview, then back to Claude — collapse preserved
        const overview_tab = find_live_button(/总览/);
        fireEvent.click(overview_tab);
        const claude_tab = find_live_button(/^Claude$/);
        fireEvent.click(claude_tab);

        await waitFor(() => {
            const expand_a = screen
                .getAllByRole("button", { name: /^展开 Account A$/ })
                .find((b) => !b.closest('[aria-hidden="true"]'));
            expect(expand_a).toBeDefined();
        });
    });

    it("reports content_height and collapsed_min_height to the main process", async () => {
        render(<PopupView />);
        const mirror_el = document.querySelector(".popup-mirror");
        if (!(mirror_el instanceof HTMLElement)) throw new Error("popup mirror not rendered");
        const mirror = mirror_el;
        // t196 AC3: single mirror. offsetHeight is content height in the normal
        // state and the all-collapsed height during the transient measure pass.
        Object.defineProperty(mirror, "offsetHeight", {
            configurable: true,
            get() {
                return mirror.getAttribute("data-measuring") === "true" ? 120 : 500;
            },
        });
        await waitFor(() => {
            const call = report_height.mock.calls.at(-1)?.[0];
            expect(call?.content_height).toBe(500);
            expect(call?.collapsed_min_height).toBe(120);
        });
    });

    it("re-reports on ResizeObserver fire", async () => {
        render(<PopupView />);
        const mirror_el = document.querySelector(".popup-mirror");
        if (!(mirror_el instanceof HTMLElement)) throw new Error("popup mirror not rendered");
        const mirror = mirror_el;
        Object.defineProperty(mirror, "offsetHeight", {
            configurable: true,
            get() {
                return mirror.getAttribute("data-measuring") === "true" ? 120 : 500;
            },
        });
        await waitFor(() => {
            const last = report_height.mock.calls.at(-1)?.[0];
            expect(last?.content_height).toBe(500);
            expect(last?.collapsed_min_height).toBe(120);
        });
        const initial_count = report_height.mock.calls.length;

        // Grow content height, fire RO → re-report with the new height.
        Object.defineProperty(mirror, "offsetHeight", {
            configurable: true,
            get() {
                return mirror.getAttribute("data-measuring") === "true" ? 120 : 700;
            },
        });
        FakeResizeObserver.fire_all();

        await waitFor(() => {
            expect(report_height.mock.calls.length).toBeGreaterThan(initial_count);
        });
        const latest = report_height.mock.calls.at(-1)?.[0];
        expect(latest?.content_height).toBe(700);
        expect(latest?.collapsed_min_height).toBe(120);
    });

    it("overview provider card expands in place showing account rows", async () => {
        render(<PopupView />);

        // In overview, find the expand toggle for Claude
        await waitFor(() => {
            const expand_btns = screen.getAllByRole("button", { name: /展开/ });
            expect(expand_btns.length).toBeGreaterThan(0);
        });

        // Click the live expand toggle
        const expand_btn = find_live_button(/展开/);
        fireEvent.click(expand_btn);

        // After expanding, the account rows should be visible
        await waitFor(() => {
            const collapse_btns = screen.getAllByRole("button", { name: /折叠/ });
            expect(collapse_btns.length).toBeGreaterThan(0);
        });
    });

    it("preserves expand state when switching tabs without structure change", async () => {
        render(<PopupView />);

        // Expand Claude in overview
        await waitFor(() => {
            expect(screen.getAllByRole("button", { name: /展开/ }).length).toBeGreaterThan(0);
        });
        const expand_btn = find_live_button(/展开/);
        fireEvent.click(expand_btn);

        await waitFor(() => {
            expect(find_live_button(/折叠/)).toBeInTheDocument();
        });

        // Switch to Claude tab and back — structure unchanged, expand preserved
        const claude_tab = find_live_button(/^Claude$/);
        fireEvent.click(claude_tab);
        const overview_tab = find_live_button(/总览/);
        fireEvent.click(overview_tab);

        await waitFor(() => {
            expect(find_live_button(/折叠/)).toBeInTheDocument();
        });
    });

    it("keeps the refresh-all spinner while a connector snapshot is loading (t196 f003)", async () => {
        let push: ((instanceId: string, state: ConnectorSnapshotDTO) => void) | undefined;
        (window.usageboard.event as { onStateChange: unknown }).onStateChange = vi.fn(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                push = cb;
                return vi.fn();
            },
        ) as never;

        render(<PopupView />);
        await waitFor(() => {
            expect(document.querySelector(".app-title")).not.toBeNull();
        });

        // 立即 ack 的 refresh-all；spinner 出现。
        const live_refresh_all = screen
            .getAllByTitle("刷新全部")
            .find((b) => !b.closest('[aria-hidden="true"]'));
        if (!live_refresh_all) throw new Error("live refresh-all button not found");
        fireEvent.click(live_refresh_all);
        await waitFor(() => {
            expect(document.querySelector('.icon-btn[title="刷新全部"].spinning')).not.toBeNull();
        });

        // 采集进行中（loading 推送）→ spinner 保持，不因立即 ack 提前结束。
        // instanceId 必须匹配 fixture 的 gateway-connector，push 才会被 use_plugins 采纳。
        await act(async () => {
            push?.("gateway-connector", { status: "loading" });
            await new Promise((resolve) => setTimeout(resolve, 0)); // flush rAF → snapshot loading
        });
        // 超过 500ms 下限后仍 spinning（真实 pending 驱动，非固定时长）。
        await new Promise((resolve) => setTimeout(resolve, 700));
        expect(document.querySelector('.icon-btn[title="刷新全部"].spinning')).not.toBeNull();

        // 采集完成（ready 推送）→ spinner 在 500ms 下限后清除。
        await act(async () => {
            push?.("gateway-connector", {
                status: "ready",
                items: [],
                updatedAt: "2026-01-01T00:00:05Z",
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
        });
        await waitFor(
            () => {
                expect(document.querySelector('.icon-btn[title="刷新全部"].spinning')).toBeNull();
            },
            { timeout: 3_000 },
        );
    });

    it("does not pin the refresh-all spinner on pre-existing loading (t196 f003)", async () => {
        let push: ((instanceId: string, state: ConnectorSnapshotDTO) => void) | undefined;
        (window.usageboard.event as { onStateChange: unknown }).onStateChange = vi.fn(
            (cb: (instanceId: string, state: ConnectorSnapshotDTO) => void) => {
                push = cb;
                return vi.fn();
            },
        ) as never;

        render(<PopupView />);
        await waitFor(() => {
            expect(document.querySelector(".app-title")).not.toBeNull();
        });

        // 点击前该 connector 已处于 loading（如定时采集占位）；先让快照 flush。
        await act(async () => {
            push?.("gateway-connector", { status: "loading" });
            await new Promise((resolve) => setTimeout(resolve, 0));
        });

        const live_refresh_all = screen
            .getAllByTitle("刷新全部")
            .find((b) => !b.closest('[aria-hidden="true"]'));
        if (!live_refresh_all) throw new Error("live refresh-all button not found");
        fireEvent.click(live_refresh_all);
        await waitFor(() => {
            expect(document.querySelector('.icon-btn[title="刷新全部"].spinning')).not.toBeNull();
        });

        // pre-existing loading 被排除：500ms 下限后 spinner 清除，不钉死。
        await waitFor(
            () => {
                expect(document.querySelector('.icon-btn[title="刷新全部"].spinning')).toBeNull();
            },
            { timeout: 3_000 },
        );
    });
});

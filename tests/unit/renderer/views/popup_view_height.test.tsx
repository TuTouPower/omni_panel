import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type { ConnectorInfo, PopupContentHeightReport } from "../../../../src/shared/types/ipc";

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
    const source = overrides.source ?? "cpa";
    const supportedProviders = overrides.supportedProviders ?? ["claude"];
    const activeProviders = overrides.activeProviders ?? supportedProviders;
    return {
        instanceId: overrides.instanceId ?? `${source}-connector`,
        sourceInstanceId: overrides.sourceInstanceId ?? `${source}-main`,
        stateId: overrides.stateId ?? `${source}-state`,
        name: overrides.name ?? `${source}-name`,
        displayName: overrides.displayName ?? source.toUpperCase(),
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
    source: "cpa",
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
                source: "cpa",
                sourceInstanceId: "cpa-main",
                accountId: "acc-a",
                accountLabel: "Account A",
                name: "Window A",
                used: 10,
                limit: 100,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
            },
            {
                id: "claude-pro-b",
                provider: "claude",
                source: "cpa",
                sourceInstanceId: "cpa-main",
                accountId: "acc-b",
                accountLabel: "Account B",
                name: "Window B",
                used: 20,
                limit: 200,
                displayStyle: "percent",
                resetAt: null,
                status: "normal",
            },
        ],
    },
});

const plugin_list = vi.fn<() => Promise<ConnectorInfo[]>>();
const plugin_refresh = vi.fn().mockResolvedValue(undefined);
const plugin_refresh_all = vi.fn().mockResolvedValue(undefined);
const report_height = vi.fn<(payload: PopupContentHeightReport) => void>();

describe("PopupView collapse + height report", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        FakeResizeObserver.reset();
        (globalThis as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;
        plugin_list.mockResolvedValue([claude_with_accounts]);
        window.usageboard = {
            platform: "win32",
            plugin: {
                list: plugin_list,
                getState: vi.fn(),
                refresh: plugin_refresh,
                refreshAll: plugin_refresh_all,
            },
            config: {
                get: vi.fn(),
                save: vi.fn(),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(() => vi.fn()),
                onThemeChange: vi.fn(),
            },
            popup: {
                report_content_height: report_height,
            },
            log: vi.fn(),
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
        expect(account_a_card?.querySelector(".ub-rows")).toBeNull();

        const live_b_card = screen
            .getAllByRole("button", { name: /^折叠 Account B$/ })
            .find((b) => !b.closest('[aria-hidden="true"]'))
            ?.closest(".card");
        expect(live_b_card?.querySelector(".ub-rows")).not.toBeNull();
    });

    it("resets collapse state when switching tabs", async () => {
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

        // Switch to overview, then back to Claude
        const overview_tab = find_live_button(/总览/);
        fireEvent.click(overview_tab);
        const claude_tab = find_live_button(/^Claude$/);
        fireEvent.click(claude_tab);

        await waitFor(() => {
            const fold_a = screen
                .getAllByRole("button", { name: /^折叠 Account A$/ })
                .find((b) => !b.closest('[aria-hidden="true"]'));
            expect(fold_a).toBeDefined();
        });
    });

    it("reports content_height and collapsed_min_height to the main process", async () => {
        render(<PopupView />);
        await waitFor(() => {
            expect(report_height).toHaveBeenCalled();
        });
        const call = report_height.mock.calls[0]?.[0];
        expect(call).toBeDefined();
        expect(typeof call?.content_height).toBe("number");
        expect(typeof call?.collapsed_min_height).toBe("number");
    });

    it("re-reports on ResizeObserver fire", async () => {
        render(<PopupView />);
        await waitFor(() => {
            expect(report_height).toHaveBeenCalled();
        });
        const initial_count = report_height.mock.calls.length;

        const mirrors = document.querySelectorAll(".popup-mirror");
        expect(mirrors.length).toBe(2);
        Object.defineProperty(mirrors[0], "offsetHeight", {
            configurable: true,
            value: 500,
        });
        Object.defineProperty(mirrors[1], "offsetHeight", {
            configurable: true,
            value: 120,
        });
        FakeResizeObserver.fire_all();

        await waitFor(() => {
            expect(report_height.mock.calls.length).toBeGreaterThan(initial_count);
        });
        const latest = report_height.mock.calls.at(-1)?.[0];
        expect(latest?.content_height).toBe(500);
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

    it("resets overview expand state when structure changes via tab switch", async () => {
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

        // Switch to Claude tab and back — structure signature changes, collapse resets
        const claude_tab = find_live_button(/^Claude$/);
        fireEvent.click(claude_tab);
        const overview_tab = find_live_button(/总览/);
        fireEvent.click(overview_tab);

        await waitFor(() => {
            const expand_btns = screen.getAllByRole("button", { name: /展开/ });
            expect(expand_btns.length).toBeGreaterThan(0);
        });
    });
});

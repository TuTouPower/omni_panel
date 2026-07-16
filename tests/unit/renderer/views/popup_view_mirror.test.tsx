import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PopupView } from "../../../../src/renderer/views/PopupView";
import type { ConnectorInfo } from "../../../../src/shared/types/ipc";

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

class FakeResizeObserver {
    private static instances: FakeResizeObserver[] = [];
    constructor() {
        FakeResizeObserver.instances.push(this);
    }
    observe() {
        // ignore
    }
    unobserve() {
        // ignore
    }
    disconnect() {
        // ignore
    }
    static reset() {
        FakeResizeObserver.instances = [];
    }
}

function connector(): ConnectorInfo {
    return {
        instanceId: "cpa-connector",
        sourceInstanceId: "cpa-main",
        stateId: "cpa-state",
        name: "cpa-name",
        displayName: "CPA",
        enabled: true,
        source: "gateway",
        supportedProviders: ["claude"],
        activeProviders: ["claude"],
        metadata: null,
        snapshot: {
            status: "ready",
            updatedAt: "2026-01-01T00:00:00Z",
            items: [],
        },
    };
}

describe("PopupView mirror isolation", () => {
    beforeEach(() => {
        FakeResizeObserver.reset();
        (globalThis as Record<string, unknown>)["ResizeObserver"] = FakeResizeObserver;
        const plugin_list = vi
            .fn<() => Promise<ConnectorInfo[]>>()
            .mockResolvedValue([connector()]);
        window.usageboard = {
            platform: "win32",
            plugin: {
                list: plugin_list,
                getState: vi.fn(),
                refresh: vi.fn().mockResolvedValue(undefined),
                refreshAll: vi.fn().mockResolvedValue(undefined),
            },
            connector: {
                list: plugin_list,
                getState: vi.fn(),
                refresh: vi.fn().mockResolvedValue(undefined),
                refreshAll: vi.fn().mockResolvedValue(undefined),
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
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(() => vi.fn()),
                onThemeChange: vi.fn(),
                onSettingsNavigate: vi.fn(() => vi.fn()),
            },
            popup: {
                report_content_height: vi.fn(),
            },
            main_panel: { hide: vi.fn(), get_mode: vi.fn().mockResolvedValue("popup") },
            settings: { open: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
            theme: { set: vi.fn() },
            tray: {
                open_panel: vi.fn(),
                refresh_all: vi.fn(),
                toggle_pause: vi.fn(),
                toggle_autostart: vi.fn(),
                open_settings: vi.fn(),
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
            logs: { export: vi.fn() },
            log: vi.fn(),
        };
    });

    it("renders exactly one live tabs-wrap and marks mirror tabs-wrap distinctly", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getAllByRole("button", { name: /总览/ }).length).toBeGreaterThan(0);
        });

        const live_tabs = document.querySelectorAll(".tabs-wrap:not(.tabs-wrap-mirror)");
        const mirror_tabs = document.querySelectorAll(".tabs-wrap.tabs-wrap-mirror");

        // Exactly one live tabs-wrap (the one tabsRef binds to).
        expect(live_tabs.length).toBe(1);
        // Two mirrors: content + collapsed.
        expect(mirror_tabs.length).toBe(2);

        // The live tabs-wrap lives outside any aria-hidden mirror tree.
        const live = live_tabs[0] as HTMLElement;
        expect(live.closest('[aria-hidden="true"]')).toBeNull();

        // Every mirror tabs-wrap lives inside an aria-hidden mirror tree.
        for (const m of Array.from(mirror_tabs)) {
            expect((m as HTMLElement).closest('[aria-hidden="true"]')).not.toBeNull();
        }
    });

    it("only the live tab strip exposes interactive buttons; mirror buttons are hidden from a11y tree", async () => {
        render(<PopupView />);

        await waitFor(() => {
            expect(screen.getAllByRole("button", { name: /总览/ }).length).toBeGreaterThan(0);
        });

        // getAllByRole filters out aria-hidden subtrees, so only the live
        // tab strip's "总览" button is exposed to assistive tech.
        const a11y_overview = screen.getAllByRole("button", { name: /总览/ });
        expect(a11y_overview.length).toBe(1);
        expect(a11y_overview[0]?.closest('[aria-hidden="true"]')).toBeNull();

        // The DOM still contains mirror copies (used for height measurement),
        // but they live inside aria-hidden subtrees.
        const all_overview = document.querySelectorAll('[data-tab="overview"]');
        expect(all_overview.length).toBe(3); // 1 live + 2 mirrors
        const hidden = Array.from(all_overview).filter((el) =>
            (el as HTMLElement).closest('[aria-hidden="true"]'),
        );
        expect(hidden.length).toBe(2);
    });
});

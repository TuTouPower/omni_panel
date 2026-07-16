import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TrayMenu } from "../../../../src/renderer/views/TrayMenu";
import type { AppConfiguration } from "../../../../src/shared/types/config";

const base_config: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    launchAtLogin: false,
    theme: "dark",
    plugins: [],
};

vi.mock("../../../../src/renderer/hooks/use-config", () => ({
    use_config: () => ({
        config: base_config,
        hasSecrets: {},
        loading: false,
        error: null,
        save: vi.fn(),
        getSecrets: vi.fn().mockResolvedValue({}),
        saveSecrets: vi.fn(),
        duplicate: vi.fn(),
    }),
}));

describe("TrayMenu", () => {
    beforeEach(() => {
        document.documentElement.removeAttribute("data-theme");
        window.usageboard = {
            platform: "win32",
            plugin: {
                list: vi.fn(),
                getState: vi.fn(),
                refresh: vi.fn(),
                refreshAll: vi.fn(),
            },
            // tray 窗口只有 config_readonly，仅含 get
            config: {
                get: vi.fn().mockResolvedValue({ config: base_config, hasSecrets: {} }),
            },
            event: {
                onStateChange: vi.fn(() => vi.fn()),
                onThemeChange: vi.fn(() => vi.fn()),
                onSettingsNavigate: vi.fn(() => vi.fn()),
            },
            popup: { report_content_height: vi.fn() },
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
                quit: vi.fn(),
                hide: vi.fn(),
                report_menu_size: vi.fn(),
                on_pause_state: vi.fn(() => vi.fn()),
                on_autostart_state: vi.fn(() => vi.fn()),
            },
            log: vi.fn(),
        } as unknown as typeof window.usageboard;
    });

    it("applies dark theme from saved config", async () => {
        render(<TrayMenu />);

        await waitFor(() => {
            expect(document.documentElement).toHaveAttribute("data-theme", "dark");
        });
    });
});

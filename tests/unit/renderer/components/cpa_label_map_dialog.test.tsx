import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CpaLabelMapDialog } from "../../../../src/renderer/components/CpaLabelMapDialog";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import type { MetricRecord } from "../../../../src/shared/schemas/plugin-output";

function base_config(): AppConfiguration {
    return {
        platform: "win32",
        connectorInstances: [],
        removedConnectorIds: [],
    } as unknown as AppConfiguration;
}

function sample_items(): readonly MetricRecord[] {
    return [
        {
            id: "item-1",
            metric_id: "claude:acc-1:five_hour",
            provider: "claude",
            source: "gateway",
            sourceInstanceId: "cpa-1",
            accountId: "acc-1",
            accountLabel: "Account 1",
            name: "5小时",
            raw_label: "five_hour",
            normalized_label: "5小时",
            used: 50,
            limit: 100,
            resetAt: null,
            observedAt: 1735689600000,
            stale: false,
            displayStyle: "percent",
            status: "normal",
        },
    ];
}

describe("CpaLabelMapDialog（t397 AC-003）", () => {
    let mock_get_state: ReturnType<typeof vi.fn>;
    let on_save_config: ReturnType<typeof vi.fn>;
    let on_close: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mock_get_state = vi.fn().mockResolvedValue({
            status: "ready",
            items: sample_items(),
            updatedAt: "2026-01-15T12:00:00Z",
        });
        on_save_config = vi.fn().mockResolvedValue(undefined);
        on_close = vi.fn();
        window.usageboard = {
            platform: "win32",
            connector: {
                list: vi.fn(),
                getState: mock_get_state,
                refresh: vi.fn(),
                refreshAll: vi.fn(),
            },
            plugin: {
                list: vi.fn(),
                getState: mock_get_state,
                refresh: vi.fn(),
                refreshAll: vi.fn(),
            },
            config: {
                get: vi.fn(),
                save: vi.fn(),
                getSecrets: vi.fn().mockResolvedValue({}),
                saveSecrets: vi.fn(),
                duplicate: vi.fn(),
                export: vi.fn(),
                import: vi.fn(),
            },
            event: {
                onStateChange: vi.fn(),
                onConfigChange: vi.fn(),
                onThemeChange: vi.fn(),
                onSettingsNavigate: vi.fn(),
            },
            popup: { report_content_height: vi.fn() },
            main_panel: { hide: vi.fn(), get_mode: vi.fn() },
            theme: { set: vi.fn() },
            settings: { open: vi.fn(), minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
            tray: {
                open_panel: vi.fn(),
                refresh_all: vi.fn(),
                toggle_pause: vi.fn(),
                toggle_autostart: vi.fn(),
                open_settings: vi.fn(),
                open_web: vi.fn(),
                check_update: vi.fn(),
                restart: vi.fn(),
                quit: vi.fn(),
                hide: vi.fn(),
                report_menu_size: vi.fn(),
                on_pause_state: vi.fn(),
                on_autostart_state: vi.fn(),
            },
            auth: { cookieLogin: vi.fn(), refreshCookies: vi.fn() },
            log: vi.fn(),
        } as unknown as typeof window.usageboard;
    });

    async function render_dialog(save_target: "account" | "provider"): Promise<ReturnType<typeof userEvent.setup>> {
        const user = userEvent.setup();
        render(
            <CpaLabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                save_target={save_target}
                config={base_config()}
                on_save_config={on_save_config}
                on_close={on_close}
            />,
        );
        await screen.findByText("five_hour");
        return user;
    }

    it("save_target=provider 时写入 providerLabelMaps", async () => {
        const user = await render_dialog("provider");

        const input = screen.getAllByRole("textbox")[0] as HTMLInputElement;
        await user.clear(input);
        await user.type(input, "新提供商标签");
        await user.click(screen.getByText("保存映射"));

        await waitFor(() => {
            expect(on_save_config).toHaveBeenCalled();
            const payload = on_save_config.mock.calls[0]?.[0] as AppConfiguration | undefined;
            expect(payload?.providerLabelMaps).toEqual({ claude: { five_hour: "新提供商标签" } });
        });
        // 保存成功后关闭。
        expect(on_close).toHaveBeenCalled();
    });

    it("save_target=account 时写入 accountLabelMaps（按 instance_id）", async () => {
        const user = await render_dialog("account");

        const input = screen.getAllByRole("textbox")[0] as HTMLInputElement;
        await user.clear(input);
        await user.type(input, "新账户标签");
        await user.click(screen.getByText("保存映射"));

        await waitFor(() => {
            expect(on_save_config).toHaveBeenCalled();
            const payload = on_save_config.mock.calls[0]?.[0] as AppConfiguration | undefined;
            expect(payload?.accountLabelMaps).toEqual({ "cpa-1": { five_hour: "新账户标签" } });
        });
        expect(on_close).toHaveBeenCalled();
    });
});

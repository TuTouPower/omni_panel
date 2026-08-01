import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AppConfiguration } from "../../../../src/shared/types/config";
import { SettingsView } from "../../../../src/renderer/views/SettingsView";
import {
    save,
    saveSecrets,
    duplicate,
    base_config,
    install_settings_usageboard,
} from "./settings_view_test_utils";

let current_config: AppConfiguration = base_config;

vi.mock("../../../../src/renderer/hooks/use-config", () => ({
    use_config: () => ({
        config: current_config,
        hasSecrets: { "cpa-1": { cpa_mgmt_key: true } },
        loading: false,
        error: null,
        save,
        saveSecrets,
        duplicate,
    }),
}));

vi.mock("../../../../src/renderer/lib/theme", () => ({
    useTheme: () => undefined,
}));

describe("SettingsView", () => {
    beforeEach(() => {
        current_config = base_config;
        install_settings_usageboard(() => current_config);
    });

    describe("upcoming-reset watch bell aggregation and persistence (t048)", () => {
        function setup_deepseek_multi_account(account_ids: string[]): void {
            const items = account_ids.map((account_id) => ({
                provider: "deepseek",
                source: "poll" as const,
                sourceInstanceId: "deepseek-1",
                accountId: account_id,
                accountLabel: `Label ${account_id}`,
                raw_label: "five_hour",
                normalized_label: "5小时",
            }));
            window.usageboard.connector.list = vi.fn().mockResolvedValue([
                {
                    instanceId: "deepseek-1",
                    sourceInstanceId: "deepseek-1",
                    stateId: "deepseek-1",
                    name: "deepseek",
                    displayName: "DeepSeek",
                    enabled: true,
                    source: "poll",
                    supportedProviders: ["deepseek"],
                    activeProviders: ["deepseek"],
                    metadata: {
                        parameters: [
                            {
                                name: "API_KEY",
                                label: "API 密钥",
                                type: "secret",
                                required: true,
                            },
                        ],
                        endpoints: { default: null },
                    },
                    snapshot: {
                        status: "ready",
                        updatedAt: "2026-07-23T00:00:00.000Z",
                        items,
                    },
                },
            ]);
            window.usageboard.connector.getState = vi.fn().mockResolvedValue({
                status: "ready",
                items,
            });
        }

        async function open_label_map_and_click_bell(): Promise<void> {
            const user = userEvent.setup();
            render(<SettingsView />);
            await user.click(await screen.findByTestId("settings-plugin-nav-accounts"));
            const edit_buttons = screen.getAllByTitle("编辑");
            const deepseek_edit = edit_buttons[0];
            if (!deepseek_edit) throw new Error("missing DeepSeek edit button");
            await user.click(deepseek_edit);
            await waitFor(() => expect(screen.getByText("数据标签映射")).toBeInTheDocument());
            await user.click(screen.getByText("数据标签映射"));
            const bell = await screen.findByRole("button", {
                name: "监控该数据标签的即将重置",
            });
            await user.click(bell);
        }

        it("persists add_watched_metric for every account_key when clicked from unwatched state", async () => {
            setup_deepseek_multi_account(["acc-a", "acc-b"]);
            await open_label_map_and_click_bell();

            await waitFor(() => {
                const saved = (
                    save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
                )?.[0];
                expect(saved?.accountOverrides?.upcomingResetWatched?.["deepseek"]).toEqual({
                    "deepseek-1|acc-a": ["five_hour"],
                    "deepseek-1|acc-b": ["five_hour"],
                });
            });
        });

        it("persists remove_watched_metric for every account_key when clicked from all-watched state", async () => {
            setup_deepseek_multi_account(["acc-a", "acc-b"]);
            current_config = {
                ...base_config,
                accountOverrides: {
                    upcomingResetWatched: {
                        deepseek: {
                            "deepseek-1|acc-a": ["five_hour"],
                            "deepseek-1|acc-b": ["five_hour"],
                        },
                    },
                },
            };
            await open_label_map_and_click_bell();

            await waitFor(() => {
                const saved = (
                    save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
                )?.[0];
                // After removing all keys, upcomingResetWatched is pruned entirely.
                expect(saved?.accountOverrides?.upcomingResetWatched).toBeUndefined();
            });
        });

        it("one bell click toggles all 3 account_keys sharing the raw_label", async () => {
            setup_deepseek_multi_account(["acc-a", "acc-b", "acc-c"]);
            // Partial-watched start state proves a single click aggregates across
            // all 3 account_keys (not just the one already watched).
            current_config = {
                ...base_config,
                accountOverrides: {
                    upcomingResetWatched: {
                        deepseek: { "deepseek-1|acc-a": ["five_hour"] },
                    },
                },
            };
            await open_label_map_and_click_bell();

            await waitFor(() => {
                const saved = (
                    save.mock.calls[save.mock.calls.length - 1] as [AppConfiguration] | undefined
                )?.[0];
                expect(saved?.accountOverrides?.upcomingResetWatched?.["deepseek"]).toEqual({
                    "deepseek-1|acc-a": ["five_hour"],
                    "deepseek-1|acc-b": ["five_hour"],
                    "deepseek-1|acc-c": ["five_hour"],
                });
            });
        });
    });
});

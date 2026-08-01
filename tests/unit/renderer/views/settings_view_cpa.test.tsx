import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

    it("renders CPA as a card with a parent status and status-free child rows", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        expect(card).not.toHaveTextContent("1 账号");
        expect(card).not.toHaveTextContent("1 服务商");

        const parent_row = card.querySelector<HTMLElement>(".ds-row");
        if (!parent_row) throw new Error("missing CPA parent row");
        expect(parent_row).toHaveTextContent("正常");
        expect(parent_row.querySelector(".ar-status")).toBeInTheDocument();

        // CPA child rows never expose collection status. The card has only its parent status slot.
        expect(card.querySelectorAll(".ar-status")).toHaveLength(1);
    });

    it("renders CPA connector settings page from accounts", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        await waitFor(() => {
            expect(screen.getAllByText(/CPA/).length).toBeGreaterThan(0);
        });
        const edit_buttons = screen.getAllByTitle("编辑（连接设置）");
        if (edit_buttons.length === 0) throw new Error("missing CPA edit button");
        if (!edit_buttons[0]) return;
        await user.click(edit_buttons[0]);

        await waitFor(() => {
            expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();
        });
        expect(screen.getByLabelText("备注")).toHaveValue("");
        expect(screen.getByLabelText("CPA-Manager URL")).toHaveValue("http://cpa.example");
        await waitFor(() => {
            expect(screen.getByLabelText("管理密钥")).toHaveValue("vault-secret-key");
        });
        expect(
            within(screen.getByTestId("cpa-connector-settings")).getByText("同步范围"),
        ).toBeInTheDocument();
    });

    it("fills every CPA account watch when a raw label is only partially watched", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            accountOverrides: {
                upcomingResetWatched: {
                    claude: {
                        "cpa-1|label|Account A": ["five_hour"],
                    },
                },
            },
        };
        window.usageboard.connector.getState = vi.fn().mockResolvedValue({
            status: "ready",
            updatedAt: "2026-07-25T00:00:00.000Z",
            items: [
                {
                    id: "claude-a",
                    provider: "claude",
                    source: "gateway",
                    sourceInstanceId: "cpa-1",
                    accountId: "account-a",
                    accountLabel: "Account A",
                    raw_label: "five_hour",
                    normalized_label: "5 小时",
                },
                {
                    id: "claude-b",
                    provider: "claude",
                    source: "gateway",
                    sourceInstanceId: "cpa-1",
                    accountId: "account-b",
                    accountLabel: "Account B",
                    raw_label: "five_hour",
                    normalized_label: "5 小时",
                },
            ],
        });
        render(<SettingsView />);

        await user.click(await screen.findByTestId("settings-plugin-nav-accounts"));
        const cpa_card = (await screen.findByText("CPA")).closest<HTMLElement>(".acc-card");
        const edit_button =
            cpa_card?.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_button) throw new Error("missing CPA edit button");
        await user.click(edit_button);
        const label_map_button = (await screen.findAllByTitle("编辑数据标签映射"))[0];
        if (!label_map_button) throw new Error("missing label map button");
        await user.click(label_map_button);
        await user.click(
            await screen.findByRole("button", {
                name: "监控该数据标签的即将重置",
            }),
        );

        await waitFor(() => {
            expect(save).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountOverrides: {
                        upcomingResetWatched: {
                            claude: {
                                "cpa-1|label|Account A": ["five_hour"],
                                "cpa-1|label|Account B": ["five_hour"],
                            },
                        },
                    },
                }),
            );
        });
    });

    it("removes all CPA account watches when the label-map bell is fully watched", async () => {
        const user = userEvent.setup();
        current_config = {
            ...base_config,
            accountOverrides: {
                upcomingResetWatched: {
                    claude: {
                        "cpa-1|label|Account A": ["five_hour"],
                        "cpa-1|label|Account B": ["five_hour"],
                    },
                },
            },
        };
        window.usageboard.connector.getState = vi.fn().mockResolvedValue({
            status: "ready",
            updatedAt: "2026-07-25T00:00:00.000Z",
            items: [
                {
                    id: "claude-a",
                    provider: "claude",
                    source: "gateway",
                    sourceInstanceId: "cpa-1",
                    accountId: "account-a",
                    accountLabel: "Account A",
                    raw_label: "five_hour",
                    normalized_label: "5 小时",
                },
                {
                    id: "claude-b",
                    provider: "claude",
                    source: "gateway",
                    sourceInstanceId: "cpa-1",
                    accountId: "account-b",
                    accountLabel: "Account B",
                    raw_label: "five_hour",
                    normalized_label: "5 小时",
                },
            ],
        });
        render(<SettingsView />);

        await user.click(await screen.findByTestId("settings-plugin-nav-accounts"));
        const cpa_card = (await screen.findByText("CPA")).closest<HTMLElement>(".acc-card");
        const edit_button =
            cpa_card?.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_button) throw new Error("missing CPA edit button");
        await user.click(edit_button);
        const label_map_button = (await screen.findAllByTitle("编辑数据标签映射"))[0];
        if (!label_map_button) throw new Error("missing label map button");
        await user.click(label_map_button);
        await user.click(
            await screen.findByRole("button", {
                name: "监控该数据标签的即将重置",
            }),
        );

        await waitFor(() => {
            expect(save).toHaveBeenCalledWith(
                expect.objectContaining({
                    accountOverrides: {},
                }),
            );
        });
    });

    it("saves CPA remark without refreshing and returns to accounts list", async () => {
        const user = userEvent.setup();
        const refresh_spy = vi.fn();
        window.usageboard.connector.refresh = refresh_spy;
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");
        await user.click(edit_btn);

        await user.type(screen.getByLabelText("备注"), "工作数据源");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(save).toHaveBeenCalledWith({
                ...base_config,
                plugins: [
                    base_config.plugins[0],
                    {
                        ...base_config.plugins[1],
                        displayName: "工作数据源",
                        parameterValues: {
                            monitor_claude: "true",
                            monitor_codex: "false",
                            monitor_antigravity: "false",
                            monitor_kimi: "false",
                        },
                    },
                ],
            });
        });
        expect(refresh_spy).not.toHaveBeenCalled();
        expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        expect(screen.getByText("CPA")).toBeInTheDocument();
    });

    it("refreshes only the edited CPA after endpoint changes and returns immediately", async () => {
        const user = userEvent.setup();
        const refresh_spy = vi.fn(
            () =>
                new Promise<void>(() => {
                    /* never resolves */
                }),
        );
        const refresh_all_spy = vi.fn();
        window.usageboard.connector.refresh = refresh_spy;
        window.usageboard.connector.refreshAll = refresh_all_spy;
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");
        await user.click(edit_btn);

        await user.clear(screen.getByLabelText("CPA-Manager URL"));
        await user.type(screen.getByLabelText("CPA-Manager URL"), "http://new-cpa.example");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(refresh_spy).toHaveBeenCalledWith("cpa-1");
            expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        });
        expect(refresh_all_spy).not.toHaveBeenCalled();
    });

    it("refreshes only the edited CPA after management key changes", async () => {
        const user = userEvent.setup();
        const refresh_spy = vi.fn().mockResolvedValue(undefined);
        const refresh_all_spy = vi.fn().mockResolvedValue(undefined);
        window.usageboard.connector.refresh = refresh_spy;
        window.usageboard.connector.refreshAll = refresh_all_spy;
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");
        await user.click(edit_btn);

        await user.clear(screen.getByLabelText("管理密钥"));
        await user.type(screen.getByLabelText("管理密钥"), "new-secret");
        await user.click(screen.getByTestId("cpa-settings-save-btn"));

        await waitFor(() => {
            expect(saveSecrets).toHaveBeenCalledWith("cpa-1", {
                cpa_mgmt_key: "new-secret",
            });
            expect(refresh_spy).toHaveBeenCalledWith("cpa-1");
            expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        });
        expect(refresh_spy).toHaveBeenCalledTimes(1);
        expect(refresh_all_spy).not.toHaveBeenCalled();
    });

    it("toggles CPA connection row without opening settings", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const toggle = card.querySelector<HTMLButtonElement>(".sw");
        if (!toggle) throw new Error("missing CPA toggle");

        await user.click(toggle);

        expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        expect(save).toHaveBeenCalledWith({
            ...base_config,
            plugins: [base_config.plugins[0], { ...base_config.plugins[1], enabled: false }],
        });
    });

    it("opens CPA editing as inline panel with breadcrumb, not dialog", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");

        await user.click(edit_btn);

        // Should render CPA settings inline (not in a dialog overlay)
        expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();
        // Should show breadcrumb
        expect(document.querySelector(".sp-crumb")).toBeInTheDocument();
        // Should NOT render inside an acct-dialog overlay
        const dialog = document.querySelector(".acct-dialog");
        expect(dialog).toBeNull();
    });

    it("returns to accounts list when breadcrumb back link is clicked", async () => {
        const user = userEvent.setup();
        render(<SettingsView />);

        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));
        const cpa_vendor = await screen.findByText("CPA");
        const card = cpa_vendor.closest<HTMLElement>(".acc-card");
        if (!card) throw new Error("missing CPA card");
        const edit_btn = card.querySelector<HTMLButtonElement>('[title="编辑（连接设置）"]');
        if (!edit_btn) throw new Error("missing CPA edit button");

        await user.click(edit_btn);
        expect(screen.getByTestId("cpa-connector-settings")).toBeInTheDocument();

        // Click breadcrumb link to go back
        const crumb_link = document.querySelector(".sp-crumb-link");
        if (!crumb_link) throw new Error("missing breadcrumb link");
        await user.click(crumb_link);

        // Should be back to accounts list, no inline CPA settings
        expect(screen.queryByTestId("cpa-connector-settings")).not.toBeInTheDocument();
        expect(screen.getByText("CPA")).toBeInTheDocument();
    });

    it("does not show 采集失败 for CPA accounts with critical usage status", async () => {
        // Regression: status "critical" (usage at 100%) was mapped to "error"
        // → "采集失败", even though data was collected successfully.
        const connectorMock = window.usageboard.connector as unknown as {
            list: ReturnType<typeof vi.fn>;
        };
        connectorMock.list = vi.fn().mockResolvedValue([
            {
                instanceId: "cpa-1",
                sourceInstanceId: "cpa-1",
                stateId: "cpa-1",
                name: "cpa",
                displayName: "CPA",
                enabled: true,
                source: "gateway",
                supportedProviders: ["codex"],
                activeProviders: ["codex"],
                metadata: {
                    parameters: [],
                    endpoints: { default: "http://localhost:8080" },
                },
                snapshot: {
                    status: "ready",
                    updatedAt: "2026-06-15T12:00:00.000Z",
                    items: [
                        {
                            id: "codex-full",
                            provider: "codex",
                            source: "gateway",
                            sourceInstanceId: "cpa-1",
                            accountId: "codex-full",
                            accountLabel: "Codex Account Full",
                            used: 100,
                            limit: 100,
                            displayStyle: "percent",
                            status: "critical",
                        },
                        {
                            id: "codex-ok",
                            provider: "codex",
                            source: "gateway",
                            sourceInstanceId: "cpa-1",
                            accountId: "codex-ok",
                            accountLabel: "Codex Account OK",
                            used: 10,
                            limit: 100,
                            displayStyle: "percent",
                            status: "normal",
                        },
                    ],
                },
            },
        ]);

        render(<SettingsView />);
        await screen.findByTestId("settings-plugin-nav-accounts");
        const user = userEvent.setup();
        await user.click(screen.getByTestId("settings-plugin-nav-accounts"));

        await waitFor(() => {
            expect(document.querySelectorAll(".acc-card .acc-row").length).toBeGreaterThan(1);
        });

        // CPA child rows never expose collection status.
        expect(screen.queryByText("采集失败")).not.toBeInTheDocument();
    });
});

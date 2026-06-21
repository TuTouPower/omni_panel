import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LabelMapDialog } from "../../../../src/renderer/components/LabelMapDialog";
import type { MetricRecord } from "../../../../src/shared/schemas/plugin-output";

function mock_ready_state(items: readonly MetricRecord[]) {
    return {
        status: "ready" as const,
        items,
        updatedAt: "2026-01-15T12:00:00Z",
    };
}

describe("LabelMapDialog", () => {
    let mock_get_state: ReturnType<typeof vi.fn>;
    let on_save: ReturnType<typeof vi.fn>;
    let on_close: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        mock_get_state = vi.fn();
        on_save = vi.fn().mockResolvedValue(undefined);
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

    function sample_items(): readonly MetricRecord[] {
        return [
            {
                id: "item-1",
                provider: "claude",
                source: "cpa",
                sourceInstanceId: "cpa-1",
                accountId: "acc-1",
                accountLabel: "Account 1",
                name: "Claude Pro · 5小时",
                raw_label: "Claude Pro · 5小时",
                normalized_label: "Claude Pro · 5小时",
                used: 50,
                limit: 100,
                resetAt: null,
                observedAt: 1735689600000,
                stale: false,
                displayStyle: "percent",
                status: "normal",
            },
            {
                id: "item-2",
                provider: "claude",
                source: "cpa",
                sourceInstanceId: "cpa-1",
                accountId: "acc-1",
                accountLabel: "Account 1",
                name: "Claude Pro · 一周",
                raw_label: "Claude Pro · 一周",
                normalized_label: "Claude Pro · 一周",
                used: 200,
                limit: 500,
                resetAt: null,
                observedAt: 1735689600000,
                stale: false,
                displayStyle: "ratio",
                status: "normal",
            },
        ];
    }

    it("shows loading state while fetching plugin state", () => {
        // eslint-disable-next-line @typescript-eslint/no-empty-function
        mock_get_state.mockReturnValue(new Promise(() => {})); // never resolves
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        expect(screen.getByText("正在加载标签数据…")).toBeInTheDocument();
    });

    it("shows empty state when no items match vendor_id", async () => {
        mock_get_state.mockResolvedValue(mock_ready_state([]));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("该服务暂无可映射的数据标签")).toBeInTheDocument();
        });
    });

    it("shows raw labels and default display names when state is ready", async () => {
        mock_get_state.mockResolvedValue(mock_ready_state(sample_items()));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("Claude Pro · 5小时")).toBeInTheDocument();
        });
        expect(screen.getByText("Claude Pro · 一周")).toBeInTheDocument();
        expect(screen.getByText("保存映射")).toBeInTheDocument();
    });

    it("applies existing_map as default values for display names", async () => {
        mock_get_state.mockResolvedValue(mock_ready_state(sample_items()));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{ "Claude Pro · 5小时": "我的克劳德额度" }}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            const inputs = screen.getAllByRole("textbox");
            const mapped = inputs.find((i) => (i as HTMLInputElement).value === "我的克劳德额度");
            expect(mapped).toBeDefined();
        });
    });

    it("filters items to only match vendor_id", async () => {
        mock_get_state.mockResolvedValue(
            mock_ready_state([
                ...sample_items(),
                {
                    id: "item-3",
                    provider: "codex",
                    source: "cpa",
                    sourceInstanceId: "cpa-1",
                    accountId: "acc-2",
                    accountLabel: "Account 2",
                    name: "Codex · 5小时",
                    raw_label: "Codex · 5小时",
                    normalized_label: "Codex · 5小时",
                    used: 10,
                    limit: 50,
                    resetAt: null,
                    observedAt: 1735689600000,
                    stale: false,
                    displayStyle: "percent",
                    status: "normal",
                },
            ]),
        );
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("Claude Pro · 5小时")).toBeInTheDocument();
        });
        expect(screen.queryByText("Codex · 5小时")).not.toBeInTheDocument();
    });

    it("normalizes CPA labels by removing account names and duplicates", async () => {
        mock_get_state.mockResolvedValue(
            mock_ready_state([
                {
                    id: "codex-a-5h",
                    provider: "codex",
                    source: "cpa",
                    sourceInstanceId: "cpa-1",
                    accountId: "acc-a",
                    accountLabel: "Account A",
                    name: "Codex (Account A) · 5小时",
                    raw_label: "Codex (Account A) · 5小时",
                    normalized_label: "Codex (Account A) · 5小时",
                    used: 10,
                    limit: 50,
                    resetAt: null,
                    observedAt: 1735689600000,
                    stale: false,
                    displayStyle: "percent",
                    status: "normal",
                },
                {
                    id: "codex-b-5h",
                    provider: "codex",
                    source: "cpa",
                    sourceInstanceId: "cpa-1",
                    accountId: "acc-b",
                    accountLabel: "Account B",
                    name: "Codex (Account B) · 5小时",
                    raw_label: "Codex (Account B) · 5小时",
                    normalized_label: "Codex (Account B) · 5小时",
                    used: 20,
                    limit: 50,
                    resetAt: null,
                    observedAt: 1735689600000,
                    stale: false,
                    displayStyle: "percent",
                    status: "normal",
                },
                {
                    id: "codex-b-week",
                    provider: "codex",
                    source: "cpa",
                    sourceInstanceId: "cpa-1",
                    accountId: "acc-b",
                    accountLabel: "Account B",
                    name: "Codex (Account B) · 每周",
                    raw_label: "Codex (Account B) · 每周",
                    normalized_label: "Codex (Account B) · 每周",
                    used: 20,
                    limit: 50,
                    resetAt: null,
                    observedAt: 1735689600000,
                    stale: false,
                    displayStyle: "percent",
                    status: "normal",
                },
            ]),
        );
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="codex"
                account_name="CPA · Codex"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );

        await waitFor(() => {
            expect(screen.getByText("Codex · 5小时")).toBeInTheDocument();
        });
        expect(screen.getByText("Codex · 每周")).toBeInTheDocument();
        expect(screen.queryByText("Codex (Account A) · 5小时")).not.toBeInTheDocument();
        expect(screen.queryByText("Codex (Account B) · 5小时")).not.toBeInTheDocument();
        expect(screen.getAllByRole("textbox")).toHaveLength(2);
    });

    it("resets single row to default when reset button clicked", async () => {
        const user = userEvent.setup();
        mock_get_state.mockResolvedValue(mock_ready_state(sample_items()));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("Claude Pro · 5小时")).toBeInTheDocument();
        });

        const inputs = screen.getAllByRole("textbox");
        expect(inputs.length).toBeGreaterThanOrEqual(1);
        const first_input = inputs[0] as HTMLInputElement;

        await user.clear(first_input);
        await user.type(first_input, "自定义名称");
        expect(first_input.value).toBe("自定义名称");

        const reset_btn = screen.getByTitle("恢复默认");
        await user.click(reset_btn);
        expect(first_input.value).toBe("Claude Pro · 5小时");
    });

    it("calls on_save with only changed mappings", async () => {
        const user = userEvent.setup();
        mock_get_state.mockResolvedValue(mock_ready_state(sample_items()));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("保存映射")).toBeInTheDocument();
        });

        const inputs = screen.getAllByRole("textbox");
        expect(inputs.length).toBeGreaterThanOrEqual(1);
        const first = inputs[0] as HTMLInputElement;
        await user.clear(first);
        await user.type(first, "新名称");
        await user.click(screen.getByText("保存映射"));

        await waitFor(() => {
            expect(on_save).toHaveBeenCalledWith("cpa-1", {
                "Claude Pro · 5小时": "新名称",
            });
        });
    });

    it("resets all rows to default", async () => {
        const user = userEvent.setup();
        mock_get_state.mockResolvedValue(mock_ready_state(sample_items()));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("全部恢复默认")).toBeInTheDocument();
        });

        const inputs = screen.getAllByRole("textbox");
        const el0 = inputs[0] as HTMLInputElement;
        const el1 = inputs[1] as HTMLInputElement;
        expect(inputs.length).toBeGreaterThanOrEqual(2);
        await user.clear(el0);
        await user.type(el0, "改1");
        await user.clear(el1);
        await user.type(el1, "改2");

        const reset_all_btn = screen.getByText("全部恢复默认");
        expect(reset_all_btn).not.toBeDisabled();
        await user.click(reset_all_btn);

        expect(el0.value).toBe("Claude Pro · 5小时");
        expect(el1.value).toBe("Claude Pro · 一周");
    });

    it("closes when cancel button is clicked", async () => {
        const user = userEvent.setup();
        mock_get_state.mockResolvedValue(mock_ready_state(sample_items()));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("取消")).toBeInTheDocument();
        });
        await user.click(screen.getByText("取消"));
        expect(on_close).toHaveBeenCalled();
    });

    it("closes on ESC key", async () => {
        mock_get_state.mockResolvedValue(mock_ready_state([]));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("该服务暂无可映射的数据标签")).toBeInTheDocument();
        });
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
        expect(on_close).toHaveBeenCalled();
    });

    it("closes when clicking the scrim backdrop", async () => {
        mock_get_state.mockResolvedValue(mock_ready_state([]));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("该服务暂无可映射的数据标签")).toBeInTheDocument();
        });
        const scrim = document.querySelector(".acct-dialog-scrim");
        if (!scrim) throw new Error("missing scrim");
        fireEvent.mouseDown(scrim);
        expect(on_close).toHaveBeenCalled();
    });

    it("does not close when clicking inside the dialog", async () => {
        mock_get_state.mockResolvedValue(mock_ready_state([]));
        render(
            <LabelMapDialog
                instance_id="cpa-1"
                vendor_id="claude"
                account_name="CPA · Claude"
                existing_map={{}}
                on_save={on_save}
                on_close={on_close}
            />,
        );
        await waitFor(() => {
            expect(screen.getByText("该服务暂无可映射的数据标签")).toBeInTheDocument();
        });
        const dialog = document.querySelector(".acct-dialog");
        if (!dialog) throw new Error("missing dialog");
        fireEvent.mouseDown(dialog);
        expect(on_close).not.toHaveBeenCalled();
    });
});

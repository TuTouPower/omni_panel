import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AccountsList } from "../../../../../src/renderer/views/settings-view/sections/accounts_list";
import type { AppConfiguration } from "../../../../../src/shared/types/config";
import type { ConnectorInfo } from "../../../../../src/shared/types/ipc";
import type { MetricRecord } from "../../../../../src/shared/schemas/plugin-output";

// mock CpaCard：绕过其 provider:account_id 去重（unique_accounts 只渲染首行），
// 让同 accountId 双 label 两行都可见可点击——才能区分「account_key 精确匹配」
// 与「find(provider, accountId) 首匹配」。
vi.mock("../../../../../src/renderer/components/CpaCard", () => ({
    CpaCard: ({
        rows,
        on_unhide,
        on_clear,
    }: {
        rows: { account_label: string; account_key: string }[];
        on_unhide: (t: { provider: string; account_id: string; account_key: string }) => void;
        on_clear: (t: { provider: string; account_id: string; account_key: string }) => void;
    }) => (
        <div>
            {rows.map((row) => (
                <div key={row.account_key} data-testid={`row-${row.account_label}`}>
                    <span>{row.account_label}</span>
                    <button
                        onClick={() => {
                            on_unhide({
                                provider: "claude",
                                account_id: "acc-1",
                                account_key: row.account_key,
                            });
                        }}
                    >
                        恢复
                    </button>
                    <button
                        onClick={() => {
                            on_clear({
                                provider: "claude",
                                account_id: "acc-1",
                                account_key: row.account_key,
                            });
                        }}
                    >
                        清除
                    </button>
                </div>
            ))}
        </div>
    ),
}));

// 同 provider(claude) 同 accountId(acc-1) 不同 label 的双账号（gateway 子账号）。
function cpa_items(): readonly MetricRecord[] {
    const base = {
        id: "m",
        metric_id: "claude:acc-1:five_hour",
        provider: "claude" as const,
        source: "gateway" as const,
        sourceInstanceId: "cpa-1",
        accountId: "acc-1",
        accountLabel: "Label A",
        name: "5小时",
        raw_label: "five_hour",
        normalized_label: "5小时",
        used: 50,
        limit: 100,
        resetAt: null,
        observedAt: 1735689600000,
        stale: false,
        displayStyle: "percent" as const,
        status: "normal" as const,
    };
    return [base, { ...base, id: "m2", accountLabel: "Label B" }];
}

function base_config(): AppConfiguration {
    return {
        schemaVersion: 1,
        language: "zh-Hans",
        launchAtLogin: false,
        plugins: [
            {
                instanceId: "cpa-1",
                source: "gateway",
                enabled: true,
                displayName: "CPA",
                executablePath: "plugins/cpa.ts",
                refreshIntervalSeconds: 300,
                parameterValues: {},
                endpointOverrides: { default: null },
            },
        ],
        cacheMaxMb: 100,
        globalRefreshIntervalSeconds: 300,
    } as unknown as AppConfiguration;
}

function make_plugin_info(items: readonly MetricRecord[]): ConnectorInfo {
    return {
        instanceId: "cpa-1",
        sourceInstanceId: "cpa-1",
        stateId: "cpa-1",
        name: "cpa",
        displayName: "CPA",
        enabled: true,
        source: "gateway",
        supportedProviders: ["claude"],
        activeProviders: ["claude"],
        metadata: { parameters: [], endpoints: { default: null } },
        snapshot: { status: "ready", updatedAt: "2026-01-15T00:00:00Z", items },
    } as unknown as ConnectorInfo;
}

function render_accounts_list(
    config: AppConfiguration,
    items: readonly MetricRecord[],
    restore_override_account: ReturnType<typeof vi.fn>,
): ReturnType<typeof userEvent.setup> {
    const user = userEvent.setup();
    render(
        <AccountsList
            config={config}
            hide_account={vi.fn()}
            plugin_infos={[make_plugin_info(items)]}
            restore_override_account={restore_override_account}
            save_config={vi.fn().mockResolvedValue(undefined)}
            set_delete_confirm_id={vi.fn()}
            set_delete_confirm_name={vi.fn()}
            set_dialog={vi.fn()}
            set_editing_cpa_id={vi.fn()}
            set_remove_cpa_confirm_id={vi.fn()}
            set_remove_cpa_confirm_name={vi.fn()}
            set_rename_target={vi.fn()}
        />,
    );
    return user;
}

describe("AccountsList 行级 override 键（t398 AC-001）", () => {
    it("unhide 双 label 行各自删对应 accountKey——find 首匹配会误删 Label A", async () => {
        const items = cpa_items();
        const restore = vi.fn();
        const config: AppConfiguration = {
            ...base_config(),
            accountOverrides: {
                hidden: { claude: ["cpa-1|label|Label A", "cpa-1|label|Label B"] },
            },
        };
        const user = render_accounts_list(config, items, restore);

        // mock CpaCard 渲染两行（Label A / Label B 同 accountId），都可见。
        expect(document.querySelector('[data-testid="row-Label A"]')).not.toBeNull();
        expect(document.querySelector('[data-testid="row-Label B"]')).not.toBeNull();

        // 点击 Label B 行「恢复」→ 应删 Label B 的键（行级 account_key 匹配）。
        const label_b_row = document.querySelector('[data-testid="row-Label B"]');
        if (!label_b_row) throw new Error("missing Label B row");
        const unhide_btn = label_b_row.querySelector("button");
        if (!unhide_btn) throw new Error("missing unhide button");
        await user.click(unhide_btn);

        // AC-001 核心：精确匹配 account_key → restore Label B 键。
        // 修复前 find(provider, accountId) 首命中 Label A → restore Label A 键（断言必挂）。
        expect(restore).toHaveBeenCalledWith("claude", "cpa-1|label|Label B", "hidden");
        expect(restore).not.toHaveBeenCalledWith("claude", "cpa-1|label|Label A", "hidden");
    });

    it("clear 双 label 行各自删对应 accountKey——find 首匹配会误删 Label A", async () => {
        const items = cpa_items();
        const restore = vi.fn();
        const config: AppConfiguration = {
            ...base_config(),
            accountOverrides: {
                hidden: { claude: ["cpa-1|label|Label A", "cpa-1|label|Label B"] },
            },
        };
        const user = render_accounts_list(config, items, restore);

        const label_a_row = document.querySelector('[data-testid="row-Label A"]');
        if (!label_a_row) throw new Error("missing Label A row");
        const clear_buttons = [...label_a_row.querySelectorAll("button")];
        const clear_btn = clear_buttons.find((b) => b.textContent.includes("清除"));
        if (!clear_btn) throw new Error("missing clear button");
        await user.click(clear_btn);

        expect(restore).toHaveBeenCalledWith("claude", "cpa-1|label|Label A", "hidden");
        expect(restore).not.toHaveBeenCalledWith("claude", "cpa-1|label|Label B", "hidden");
    });
});

import type { AppConfiguration } from "../../../../shared/types/config";
import type { ConnectorInfo } from "../../../../shared/types/ipc";
import type { MetricRecord, UsageProvider } from "../../../../shared/schemas/plugin-output";
import { CpaCard } from "../../../components/CpaCard";
import { type VendorId } from "../../../components/Icon";
import { VendorCard } from "../../../components/VendorCard";
import { connection_status, map_status, snapshot_items } from "../lib";
import type { AccountsDialogState, AccountsRenameTarget } from "./accounts_section";

export function AccountsList({
    config,
    hide_account,
    plugin_infos,
    restore_override_account,
    save_config,
    set_delete_confirm_id,
    set_delete_confirm_name,
    set_dialog,
    set_editing_cpa_id,
    set_remove_cpa_confirm_id,
    set_remove_cpa_confirm_name,
    set_rename_target,
}: {
    config: AppConfiguration;
    hide_account: (item: MetricRecord) => void;
    plugin_infos: ConnectorInfo[];
    restore_override_account: (provider: UsageProvider, key: string, kind: "hidden") => void;
    save_config: (payload: AppConfiguration) => Promise<void>;
    set_delete_confirm_id: (value: string | null) => void;
    set_delete_confirm_name: (value: string) => void;
    set_dialog: (value: AccountsDialogState) => void;
    set_editing_cpa_id: (value: string | null) => void;
    set_remove_cpa_confirm_id: (value: string | null) => void;
    set_remove_cpa_confirm_name: (value: string) => void;
    set_rename_target: (value: AccountsRenameTarget | null) => void;
}) {
    /* ── build view model ── */
    const direct_groups = new Map<
        VendorId,
        {
            instance_ids: string[];
            rows: {
                instance_id: string;
                account_label: string;
                enabled: boolean;
                status: "ok" | "error" | "auth" | "disabled" | "unknown";
            }[];
        }
    >();
    const cpa_plugins: (typeof config.plugins)[number][] = [];

    for (const plugin of config.plugins) {
        const info = plugin_infos.find((item) => item.instanceId === plugin.instanceId);
        const is_cpa = info?.source === "gateway";
        if (is_cpa) {
            cpa_plugins.push(plugin);
        } else {
            const provider_id = info?.activeProviders[0] ?? "overview";
            const existing = direct_groups.get(provider_id);
            const status_label = info
                ? connection_status(info, plugin.enabled)
                : plugin.enabled
                  ? "未连接"
                  : "已停用";
            const row = {
                instance_id: plugin.instanceId,
                account_label: info?.displayName ?? "",
                enabled: plugin.enabled,
                status: map_status(status_label),
            };
            if (existing) {
                existing.instance_ids.push(plugin.instanceId);
                existing.rows.push(row);
            } else {
                direct_groups.set(provider_id, {
                    instance_ids: [plugin.instanceId],
                    rows: [row],
                });
            }
        }
    }

    return (
        <div className="acct-list">
            {Array.from(direct_groups.entries()).map(([provider_id, group]) => (
                <VendorCard
                    key={provider_id}
                    provider={provider_id}
                    rows={group.rows}
                    on_toggle={(instance_id) => {
                        void save_config({
                            ...config,
                            plugins: config.plugins.map((pl) =>
                                pl.instanceId === instance_id
                                    ? {
                                          ...pl,
                                          enabled: !pl.enabled,
                                      }
                                    : pl,
                            ),
                        });
                    }}
                    on_refresh={(instance_id) => {
                        void window.usageboard.connector.refresh(instance_id);
                    }}
                    on_edit={(instance_id) => {
                        const info = plugin_infos.find((p) => p.instanceId === instance_id);
                        set_dialog({
                            mode: "edit",
                            instanceId: instance_id,
                            pluginName: info?.displayName,
                        });
                    }}
                    on_delete={(instance_id) => {
                        const info = plugin_infos.find((p) => p.instanceId === instance_id);
                        set_delete_confirm_id(instance_id);
                        set_delete_confirm_name(info?.displayName ?? instance_id);
                    }}
                    desensitizeRemarks={config.uiDesensitizeRemarks === true}
                />
            ))}
            {cpa_plugins.map((plugin) => {
                const info = plugin_infos.find((item) => item.instanceId === plugin.instanceId);
                const items = info ? snapshot_items(info) : [];
                const connector_status: "ok" | "partial" | "error" | "disabled" | "unknown" =
                    plugin.enabled
                        ? info?.snapshot.status === "ready"
                            ? items.length > 0
                                ? "ok"
                                : "unknown"
                            : info?.snapshot.status === "failed"
                              ? items.length > 0
                                  ? "partial"
                                  : "error"
                              : "unknown"
                        : "disabled";

                return (
                    <CpaCard
                        key={plugin.instanceId}
                        instance_id={plugin.instanceId}
                        display_name={info?.displayName ?? ""}
                        enabled={plugin.enabled}
                        status={connector_status}
                        desensitizeRemarks={config.uiDesensitizeRemarks === true}
                        rows={items.map((item) => {
                            const is_hidden =
                                config.accountOverrides?.hidden?.[item.provider]?.includes(
                                    item.accountId,
                                ) ?? false;
                            const mapped_status: "ok" | "error" | "unknown" =
                                item.status === "normal" ||
                                item.status === "warning" ||
                                item.status === "critical"
                                    ? "ok"
                                    : "unknown";
                            return {
                                provider: item.provider,
                                account_id: item.accountId,
                                account_label:
                                    config.accountLabels?.[item.provider]?.[item.accountId] ??
                                    item.accountLabel,
                                status: mapped_status,
                                is_hidden,
                                is_removed: false,
                            };
                        })}
                        on_toggle={() => {
                            void save_config({
                                ...config,
                                plugins: config.plugins.map((pl) =>
                                    pl.instanceId === plugin.instanceId
                                        ? {
                                              ...pl,
                                              enabled: !pl.enabled,
                                          }
                                        : pl,
                                ),
                            });
                        }}
                        on_refresh={() => {
                            void window.usageboard.connector.refresh(plugin.instanceId);
                        }}
                        on_edit={() => {
                            set_editing_cpa_id(plugin.instanceId);
                        }}
                        on_delete={() => {
                            set_remove_cpa_confirm_id(plugin.instanceId);
                            set_remove_cpa_confirm_name(info?.displayName ?? plugin.instanceId);
                        }}
                        on_hide={(target) => {
                            const item = items.find(
                                (it) =>
                                    it.provider === target.provider &&
                                    it.accountId === target.account_id,
                            );
                            if (!item) return;
                            hide_account(item);
                        }}
                        on_unhide={(target) => {
                            restore_override_account(
                                target.provider as UsageProvider,
                                target.account_id,
                                "hidden",
                            );
                        }}
                        on_clear={(target) => {
                            restore_override_account(
                                target.provider as UsageProvider,
                                target.account_id,
                                "hidden",
                            );
                        }}
                        on_rename={(target) => {
                            set_rename_target({
                                provider: target.provider,
                                account_id: target.account_id,
                                label:
                                    config.accountLabels?.[target.provider as UsageProvider]?.[
                                        target.account_id
                                    ] ??
                                    items.find(
                                        (it) =>
                                            it.provider === target.provider &&
                                            it.accountId === target.account_id,
                                    )?.accountLabel ??
                                    "",
                            });
                        }}
                    />
                );
            })}
        </div>
    );
}

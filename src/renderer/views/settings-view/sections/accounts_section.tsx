import type { AppConfiguration } from "../../../../shared/types/config";
import type { ConnectorInfo } from "../../../../shared/types/ipc";
import type { MetricRecord, UsageProvider } from "../../../../shared/schemas/plugin-output";
import { CpaCard } from "../../../components/CpaCard";
import { CpaConnectorSettings } from "../../../components/CpaConnectorSettings";
import { Icon, type VendorId } from "../../../components/Icon";
import { VendorCard } from "../../../components/VendorCard";
import { PROVIDER_LABELS } from "../../../lib/provider-usage";
import type { SavePluginSettings } from "../../../hooks/use_connector_catalog";
import { connection_status, map_status, snapshot_items, trigger_background_refresh } from "../lib";

export interface AccountsDialogState {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
}

export interface AccountsLabelMapDialogState {
    instance_id: string;
    vendor_id: string;
    account_name: string;
    save_target: "account" | "provider";
}

export interface AccountsRenameTarget {
    provider: string;
    account_id: string;
    label: string;
}

export function AccountsSection({
    config,
    editing_cpa_id,
    has_secrets,
    hide_account,
    interval_label,
    plugin_infos,
    refresh_plugin,
    restore_override_account,
    save_config,
    save_plugin_secrets,
    save_plugin_settings,
    set_delete_confirm_id,
    set_delete_confirm_name,
    set_dialog,
    set_editing_cpa_id,
    set_label_map_dialog,
    set_remove_cpa_confirm_id,
    set_remove_cpa_confirm_name,
    set_rename_target,
}: {
    config: AppConfiguration;
    editing_cpa_id: string | null;
    has_secrets: Record<string, Record<string, boolean>>;
    hide_account: (item: MetricRecord) => void;
    interval_label: string;
    plugin_infos: ConnectorInfo[];
    refresh_plugin: (instance_id: string) => Promise<void>;
    restore_override_account: (provider: UsageProvider, key: string, kind: "hidden") => void;
    save_config: (payload: AppConfiguration) => Promise<void>;
    save_plugin_secrets: (instance_id: string, secrets: Record<string, string>) => Promise<void>;
    save_plugin_settings: SavePluginSettings;
    set_delete_confirm_id: (value: string | null) => void;
    set_delete_confirm_name: (value: string) => void;
    set_dialog: (value: AccountsDialogState) => void;
    set_editing_cpa_id: (value: string | null) => void;
    set_label_map_dialog: (value: AccountsLabelMapDialogState | null) => void;
    set_remove_cpa_confirm_id: (value: string | null) => void;
    set_remove_cpa_confirm_name: (value: string) => void;
    set_rename_target: (value: AccountsRenameTarget | null) => void;
}) {
    if (editing_cpa_id) {
        const editingPlugin = config.plugins.find((p) => p.instanceId === editing_cpa_id);
        const editingInfo = plugin_infos.find((p) => p.instanceId === editing_cpa_id);
        if (!editingPlugin || !editingInfo) return null;
        const editingPluginConfig = editingPlugin;
        return (
            <>
                <div className="sp-head">
                    <div className="sp-crumb">
                        <span
                            className="sp-crumb-link"
                            onClick={() => {
                                set_editing_cpa_id(null);
                            }}
                        >
                            账号
                        </span>
                        <span className="cc-sep">
                            <Icon name="chevron" size={15} />
                        </span>
                        <span className="cc-cur">{editingInfo.displayName}</span>
                    </div>
                </div>
                <div style={{ display: "flex", flex: 1 }}>
                    <CpaConnectorSettings
                        connector={editingInfo}
                        config={{
                            endpointOverrides: editingPluginConfig.endpointOverrides,
                            parameterValues: editingPluginConfig.parameterValues,
                            refreshIntervalSeconds: editingPluginConfig.refreshIntervalSeconds,
                            enabled: editingPluginConfig.enabled,
                        }}
                        enabled={editingPluginConfig.enabled}
                        displayName={editingPluginConfig.displayName ?? ""}
                        globalIntervalLabel={interval_label}
                        hasSecrets={has_secrets[editing_cpa_id] ?? {}}
                        onSave={async (
                            nonSecrets,
                            endpointOverrides,
                            refreshIntervalSeconds,
                            newDisplayName,
                        ) => {
                            await save_plugin_settings(
                                editing_cpa_id,
                                nonSecrets,
                                {},
                                endpointOverrides,
                                refreshIntervalSeconds,
                                newDisplayName,
                                false,
                            );
                        }}
                        onSaveSecrets={async (secrets) => {
                            await save_plugin_secrets(editing_cpa_id, secrets);
                        }}
                        onSaved={(shouldRefresh) => {
                            if (shouldRefresh) {
                                trigger_background_refresh(editing_cpa_id);
                            }
                            set_editing_cpa_id(null);
                        }}
                        onToggleEnabled={(nextEnabled) => {
                            void save_config({
                                ...config,
                                plugins: config.plugins.map((pl) =>
                                    pl.instanceId === editing_cpa_id
                                        ? { ...pl, enabled: nextEnabled }
                                        : pl,
                                ),
                            });
                        }}
                        onRefresh={async () => {
                            await refresh_plugin(editing_cpa_id);
                        }}
                        onRemove={() => {
                            set_remove_cpa_confirm_id(editing_cpa_id);
                            set_remove_cpa_confirm_name(editingInfo.displayName);
                        }}
                        onEditLabelMap={(provider) => {
                            set_label_map_dialog({
                                instance_id: editing_cpa_id,
                                vendor_id: provider,
                                account_name: PROVIDER_LABELS[provider] ?? provider,
                                save_target: "provider",
                            });
                        }}
                        providerLabelMaps={config.providerLabelMaps}
                    />
                </div>
            </>
        );
    }

    return (
        <>
            <div className="sp-head">
                <span className="sp-title">已添加</span>
                <button
                    className="sp-action"
                    onClick={() => {
                        set_dialog({
                            mode: "add",
                            instanceId: undefined,
                            pluginName: undefined,
                        });
                    }}
                    type="button"
                >
                    <Icon name="plus" size={15} strokeWidth={2} />
                    添加
                </button>
            </div>
            <div className="set-group-label" style={{ marginTop: 16 }}>
                已添加
            </div>
            {config.plugins.length === 0 ? (
                <div className="text-sm text-[var(--text-3)] py-4">暂无已添加连接</div>
            ) : plugin_infos.length === 0 ? (
                <div className="text-sm text-[var(--text-3)] py-4">加载中...</div>
            ) : (
                <AccountsList
                    config={config}
                    hide_account={hide_account}
                    plugin_infos={plugin_infos}
                    restore_override_account={restore_override_account}
                    save_config={save_config}
                    set_delete_confirm_id={set_delete_confirm_id}
                    set_delete_confirm_name={set_delete_confirm_name}
                    set_dialog={set_dialog}
                    set_editing_cpa_id={set_editing_cpa_id}
                    set_remove_cpa_confirm_id={set_remove_cpa_confirm_id}
                    set_remove_cpa_confirm_name={set_remove_cpa_confirm_name}
                    set_rename_target={set_rename_target}
                />
            )}
        </>
    );
}

function AccountsList({
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

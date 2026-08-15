import type { AppConfiguration } from "../../../../shared/types/config";
import type { ConnectorInfo } from "../../../../shared/types/ipc";
import type { MetricRecord, UsageProvider } from "../../../../shared/schemas/plugin-output";
import { CpaConnectorSettings } from "../../../components/CpaConnectorSettings";
import { Button } from "../../../components/ui/Button";
import { Icon } from "../../../components/Icon";
import { PROVIDER_LABELS } from "../../../lib/provider-usage";
import type { SavePluginSettings } from "../../../hooks/use_connector_catalog";
import { trigger_background_refresh } from "../lib";
import { AccountsList } from "./accounts_list";

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
                <div className="mb-4 flex items-center gap-2">
                    <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto p-0 text-[var(--color-on-surface-variant)]"
                        onClick={() => {
                            set_editing_cpa_id(null);
                        }}
                        aria-label="返回账号列表"
                    >
                        账号
                    </Button>
                    <span className="flex text-[var(--color-on-surface-muted)]" aria-hidden="true">
                        <Icon name="chevron" size={15} />
                    </span>
                    <span className="text-[length:var(--text-title-sm)] font-semibold">
                        {editingInfo.displayName}
                    </span>
                </div>
                <div className="flex flex-1">
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
            <div className="mb-4 flex items-center justify-between">
                <span className="text-[length:var(--text-title-sm)] font-semibold">已添加</span>
                <Button
                    variant="primary"
                    size="sm"
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
                </Button>
            </div>
            <div className="mb-2 mt-4 text-[length:var(--text-label-md)] font-semibold uppercase tracking-wide text-[var(--color-on-surface-muted)]">
                已添加
            </div>
            {config.plugins.length === 0 ? (
                <div className="py-4 text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                    暂无已添加连接
                </div>
            ) : plugin_infos.length === 0 ? (
                <div className="py-4 text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">加载中...</div>
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

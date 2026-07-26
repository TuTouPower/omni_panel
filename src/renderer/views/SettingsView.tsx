import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { use_config } from "../hooks/use-config";
import { useTheme } from "../lib/theme";
import { refresh_seconds_to_label } from "../lib/refresh-intervals";
import {
    add_account_override,
    remove_account_override,
    set_account_label,
    add_watched_metric,
    remove_watched_metric,
} from "../lib/account-overrides";
import { accountKey } from "../lib/provider-usage";
import { AccountDialog } from "../components/AccountDialog";
import { CpaAddDialog } from "../components/CpaAddDialog";
import { TitleBar } from "../components/TitleBar";
import { CpaLabelMapDialog } from "../components/CpaLabelMapDialog";
import { RenameAccountDialog } from "../components/RenameAccountDialog";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Icon } from "../components/Icon";
import type { ConnectorInfo, ConnectorSnapshotDTO } from "../../shared/types/ipc";
import type { AppConfiguration, AccountOverrides } from "../../shared/types/config";
import type { MetricRecord, UsageProvider } from "../../shared/schemas/plugin-output";
import { redact_config_raw } from "../../shared/lib/config_redaction";
import { useConnectorCatalog, create_instance_and_save } from "../hooks/use_connector_catalog";
import {
    log,
    should_log_raw,
    snapshot_items,
    trigger_background_refresh,
} from "./settings-view/lib";
import { AboutSection } from "./settings-view/sections/about_section";
import { AccountsSection } from "./settings-view/sections/accounts_section";
import { AppearanceSection } from "./settings-view/sections/appearance_section";
import { DataSection } from "./settings-view/sections/data_section";
import { GeneralSection } from "./settings-view/sections/general_section";

/* ── types ── */
interface DialogState {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
    providerId?: UsageProvider | undefined;
}

/* ── constants ── */
const NAV_ITEMS = [
    { id: "general", label: "常规", icon: "gear" },
    { id: "accounts", label: "账号", icon: "inbox" },
    { id: "appearance", label: "外观", icon: "palette" },
    { id: "data", label: "数据与隐私", icon: "shield" },
    { id: "about", label: "关于", icon: "info" },
] as const;

// Listen for navigate events from main panel (edit account)
function open_settings_account_dialog(
    context: { instanceId?: string; provider?: string },
    plugins: readonly ConnectorInfo[],
    setDialog: (dialog: DialogState) => void,
): boolean {
    if (context.instanceId) {
        const match = plugins.find((p) => p.instanceId === context.instanceId);
        if (match) {
            setDialog({
                mode: "edit",
                instanceId: match.instanceId,
                pluginName: match.displayName,
            });
            return true;
        }
    }

    if (context.provider) {
        const match = plugins.find((p) =>
            p.activeProviders.includes(context.provider as UsageProvider),
        );
        if (match) {
            setDialog({
                mode: "edit",
                instanceId: match.instanceId,
                pluginName: match.displayName,
            });
            return true;
        }
    }

    return false;
}

/* ── Main View ── */
export function SettingsView() {
    useTheme();
    const [build_info, set_build_info] = useState<{
        branch: string;
        commit: string;
        subject: string;
    } | null>(null);
    useEffect(() => {
        window.usageboard.buildInfo
            .get()
            .then((info) => {
                set_build_info({
                    branch: info.branch,
                    commit: info.commit,
                    subject: info.subject,
                });
            })
            .catch((err: unknown) => {
                log.warn("加载 build info 失败，关于段不显示 branch@commit", err);
            });
    }, []);
    const { config, hasSecrets, loading, error, save, saveSecrets } = use_config();
    const configRef = useRef(config);
    useEffect(() => {
        configRef.current = config;
    }, [config]);
    const [pluginInfos, setConnectorInfos] = useState<ConnectorInfo[]>([]);
    const [section, setSection] = useState("general");
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [showCpaAdd, setShowCpaAdd] = useState(false);
    const [label_map_dialog, set_label_map_dialog] = useState<{
        instance_id: string;
        vendor_id: string;
        account_name: string;
        save_target: "account" | "provider";
    } | null>(null);
    const [editingCpaId, setEditingCpaId] = useState<string | null>(null);
    const [rename_target, set_rename_target] = useState<{
        provider: string;
        account_id: string;
        label: string;
    } | null>(null);

    // Confirm-delete state for direct account deletion
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleteConfirmName, setDeleteConfirmName] = useState("");
    // Confirm-delete state for CPA data-source removal
    const [removeCpaConfirmId, setRemoveCpaConfirmId] = useState<string | null>(null);
    const [removeCpaConfirmName, setRemoveCpaConfirmName] = useState("");

    useEffect(() => {
        if (should_log_raw && config) {
            log.debug("settings config raw", { config: redact_config_raw(config) });
        }
    }, [config]);

    const save_config = useCallback(
        async (payload: AppConfiguration) => {
            if (should_log_raw) {
                log.debug("settings save payload raw", { payload: redact_config_raw(payload) });
            }
            await save(payload);
        },
        [save],
    );

    // Listen for navigate events from main panel (edit account)
    useEffect(() => {
        const unsub = window.usageboard.event.onSettingsNavigate((context) => {
            setSection("accounts");
            if (open_settings_account_dialog(context, pluginInfos, setDialog)) return;

            void window.usageboard.connector.list().then((plugins) => {
                setConnectorInfos(plugins);
                open_settings_account_dialog(context, plugins, setDialog);
            });
        });
        return unsub;
    }, [pluginInfos]);

    const restoreOverrideAccount = useCallback(
        (provider: UsageProvider, key: string, kind: "hidden") => {
            if (!config?.accountOverrides) return;
            const newOverrides = remove_account_override(
                config.accountOverrides,
                kind,
                provider,
                key,
            );
            void save_config({ ...config, accountOverrides: newOverrides });
        },
        [config, save_config],
    );

    const hide_account = useCallback(
        (item: MetricRecord) => {
            if (!config) return;
            const newOverrides = add_account_override(
                config.accountOverrides,
                "hidden",
                item.provider,
                item.accountId,
            );
            void save_config({ ...config, accountOverrides: newOverrides });
        },
        [config, save_config],
    );

    // t038：删除/移除连接器时把 manifest id 记入 tombstone（去重），重启 auto-seed 跳过。
    const with_removed_connector = useCallback(
        (base: AppConfiguration, manifest_id: string | undefined): AppConfiguration => {
            if (!manifest_id) return base;
            return {
                ...base,
                removedConnectorIds: [...(base.removedConnectorIds ?? []), manifest_id].filter(
                    (id, idx, arr) => arr.indexOf(id) === idx,
                ),
            };
        },
        [],
    );

    // Config-backed settings with defaults for optional fields
    const globalIntervalSeconds = config?.globalRefreshIntervalSeconds ?? 300;
    const usageBarColorScheme = config?.usageBarColorScheme ?? "risk-current";

    const has_multi_account = useMemo(() => {
        const accounts_by_provider = new Map<string, Set<string>>();
        for (const info of pluginInfos) {
            for (const item of snapshot_items(info)) {
                const set = accounts_by_provider.get(item.provider) ?? new Set();
                set.add(item.accountId);
                accounts_by_provider.set(item.provider, set);
            }
        }
        return [...accounts_by_provider.values()].some((set) => set.size > 1);
    }, [pluginInfos]);

    useEffect(() => {
        if (should_log_raw) {
            log.debug("settings usage bar color scheme raw", { value: usageBarColorScheme });
        }
    }, [usageBarColorScheme]);

    const interval_label = refresh_seconds_to_label(globalIntervalSeconds);

    // Local-only UI state (not persisted)
    const [localState, setLocalState] = useState({
        lang: "简体中文",
    });

    const up = useCallback((k: string, v: unknown) => {
        setLocalState((p) => ({ ...p, [k]: v }));
    }, []);

    useEffect(() => {
        if (!config) return;
        let cancelled = false;
        void window.usageboard.connector.list().then((plugins) => {
            if (!cancelled) setConnectorInfos(plugins);
        });
        return () => {
            cancelled = true;
        };
    }, [config]);

    // Keep pluginInfos in sync with live state changes from connectors
    useEffect(() => {
        const unsub = window.usageboard.event.onStateChange(
            (instanceId: string, state: ConnectorSnapshotDTO) => {
                setConnectorInfos((prev) =>
                    prev.map((p) => (p.instanceId === instanceId ? { ...p, snapshot: state } : p)),
                );
            },
        );
        return unsub;
    }, []);

    // t121: load manifest catalog once. Independent of config.plugins / tombstone,
    // so the add-account dialog can resolve auth for vendors with no live instance.
    const catalog = useConnectorCatalog();

    const savePluginSettings = useCallback(
        async (
            instanceId: string,
            nonSecrets: Record<string, string>,
            secrets: Record<string, string>,
            endpointOverrides: Record<string, string>,
            refreshIntervalSeconds: number,
            display_name?: string,
            refresh_after_save = true,
            base_config?: AppConfiguration,
        ) => {
            const current_config = base_config ?? configRef.current ?? config;
            if (!current_config) return;
            if (Object.keys(secrets).length > 0) {
                await saveSecrets(instanceId, secrets);
            }
            await save_config({
                ...current_config,
                plugins: current_config.plugins.map((plugin) => {
                    if (plugin.instanceId !== instanceId) return plugin;
                    const { displayName: _omit, ...rest } = plugin;
                    void _omit;
                    return {
                        ...rest,
                        // 合并而非整体替换（t121 code_f001）：保留 createInstance 写入的
                        // manifest 默认参数（如 cpa 的 monitor_*），仅用表单提交值覆盖。
                        parameterValues: { ...plugin.parameterValues, ...nonSecrets },
                        endpointOverrides,
                        refreshIntervalSeconds,
                        ...(display_name ? { displayName: display_name } : {}),
                    };
                }),
            });
            if (refresh_after_save) {
                trigger_background_refresh(instanceId);
            }
        },
        [config, save_config, saveSecrets],
    );

    const savePluginSecrets = useCallback(
        async (instanceId: string, secrets: Record<string, string>) => {
            if (Object.keys(secrets).length > 0) {
                await saveSecrets(instanceId, secrets);
            }
        },
        [saveSecrets],
    );

    const refreshPlugin = useCallback(async (instanceId: string) => {
        await window.usageboard.connector.refresh(instanceId);
    }, []);

    const goBack = () => {
        window.close();
    };

    if (loading) {
        return (
            <div className="window" data-window="settings">
                <TitleBar />
                <div className="p-6 text-[var(--text-3)]">加载中...</div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="window" data-window="settings">
                <TitleBar />
                <div className="p-6">
                    <div className="net-banner">
                        <Icon name="cloud_off" size={18} />
                        <span>{error}</span>
                    </div>
                </div>
            </div>
        );
    }
    if (!config) return null;

    return (
        <div className="window" data-window="settings">
            <TitleBar />

            <div className="settings">
                {/* header */}
                <div className="settings-head">
                    <button className="back-btn" onClick={goBack} type="button">
                        <Icon name="back" size={20} />
                    </button>
                    <span className="sh-title">设置</span>
                </div>

                <div className="settings-body">
                    {/* left nav */}
                    <div className="set-nav" data-testid="settings-sidebar">
                        {NAV_ITEMS.map((n) => (
                            <button
                                key={n.id}
                                className={`set-nav-item${section === n.id ? " on" : ""}`}
                                onClick={() => {
                                    setSection(n.id);
                                    setEditingCpaId(null);
                                }}
                                data-testid={`settings-plugin-nav-${n.id}`}
                                type="button"
                            >
                                <span className="sn-ic">
                                    <Icon name={n.icon} size={16} strokeWidth={1.7} />
                                </span>
                                {n.label}
                            </button>
                        ))}
                    </div>

                    {/* right content */}
                    <div className="set-content">
                        {/* ── General ── */}
                        {section === "general" && (
                            <GeneralSection
                                config={config}
                                has_multi_account={has_multi_account}
                                language={localState.lang}
                                on_language_change={(value) => {
                                    up("lang", value);
                                }}
                                save_config={save_config}
                            />
                        )}

                        {/* ── Added Connections / CPA Detail ── */}
                        {section === "accounts" && (
                            <AccountsSection
                                config={config}
                                editing_cpa_id={editingCpaId}
                                has_secrets={hasSecrets}
                                hide_account={hide_account}
                                interval_label={interval_label}
                                plugin_infos={pluginInfos}
                                refresh_plugin={refreshPlugin}
                                restore_override_account={restoreOverrideAccount}
                                save_config={save_config}
                                save_plugin_secrets={savePluginSecrets}
                                save_plugin_settings={savePluginSettings}
                                set_delete_confirm_id={setDeleteConfirmId}
                                set_delete_confirm_name={setDeleteConfirmName}
                                set_dialog={setDialog}
                                set_editing_cpa_id={setEditingCpaId}
                                set_label_map_dialog={set_label_map_dialog}
                                set_remove_cpa_confirm_id={setRemoveCpaConfirmId}
                                set_remove_cpa_confirm_name={setRemoveCpaConfirmName}
                                set_rename_target={set_rename_target}
                            />
                        )}

                        {/* ── Appearance ── */}
                        {section === "appearance" && (
                            <AppearanceSection config={config} save_config={save_config} />
                        )}

                        {/* ── Data & Privacy ── */}
                        {section === "data" && (
                            <DataSection config={config} save_config={save_config} />
                        )}

                        {/* ── About ── */}
                        {section === "about" && <AboutSection build_info={build_info} />}
                    </div>
                </div>

                {/* Rename CPA account dialog */}
                {rename_target && (
                    <RenameAccountDialog
                        account_id={rename_target.account_id}
                        current_label={rename_target.label}
                        on_save={(label) => {
                            void save_config({
                                ...config,
                                accountLabels: set_account_label(
                                    config.accountLabels,
                                    rename_target.provider,
                                    rename_target.account_id,
                                    label,
                                ),
                            });
                            set_rename_target(null);
                        }}
                        on_close={() => {
                            set_rename_target(null);
                        }}
                    />
                )}

                {/* Account dialog */}
                {dialog && (
                    <AccountDialog
                        key={`${dialog.mode}:${dialog.instanceId ?? "new"}`}
                        mode={dialog.mode}
                        instanceId={dialog.instanceId ?? undefined}
                        pluginName={dialog.pluginName}
                        pluginInfo={pluginInfos.find((p) => p.instanceId === dialog.instanceId)}
                        pluginConfig={config.plugins.find(
                            (p) => p.instanceId === dialog.instanceId,
                        )}
                        pluginInfos={pluginInfos}
                        catalog={catalog}
                        hasSecrets={dialog.instanceId ? hasSecrets[dialog.instanceId] : undefined}
                        onSave={savePluginSettings}
                        onAddAccount={async (params) => {
                            const result = await create_instance_and_save(
                                params,
                                savePluginSettings,
                            );
                            if (result) {
                                setDialog({
                                    mode: "edit",
                                    instanceId: result.instanceId,
                                    pluginName: result.pluginName,
                                });
                            }
                        }}
                        onClose={() => {
                            setDialog(null);
                        }}
                        existingLabelMap={(() => {
                            if (!dialog.instanceId) return undefined;
                            const provider = pluginInfos.find(
                                (plugin) => plugin.instanceId === dialog.instanceId,
                            )?.activeProviders[0];
                            return provider
                                ? {
                                      ...(config.accountLabelMaps?.[dialog.instanceId] ?? {}),
                                      ...(config.providerLabelMaps?.[provider] ?? {}),
                                  }
                                : (config.accountLabelMaps?.[dialog.instanceId] ?? {});
                        })()}
                        onSaveLabelMap={async (id, map) => {
                            const provider = pluginInfos.find((plugin) => plugin.instanceId === id)
                                ?.activeProviders[0];
                            if (provider) {
                                await save_config({
                                    ...config,
                                    providerLabelMaps: {
                                        ...(config.providerLabelMaps ?? {}),
                                        [provider]: {
                                            ...(config.providerLabelMaps?.[provider] ?? {}),
                                            ...map,
                                        },
                                    },
                                });
                                return;
                            }
                            await save_config({
                                ...config,
                                accountLabelMaps: {
                                    ...(config.accountLabelMaps ?? {}),
                                    [id]: {
                                        ...(config.accountLabelMaps?.[id] ?? {}),
                                        ...map,
                                    },
                                },
                            });
                        }}
                        globalIntervalLabel={interval_label}
                        forcePercent={(() => {
                            if (!dialog.instanceId) return false;
                            const provider = pluginInfos.find(
                                (plugin) => plugin.instanceId === dialog.instanceId,
                            )?.activeProviders[0];
                            return provider
                                ? config.providerForcePercent?.[provider] === true
                                : false;
                        })()}
                        onForcePercentChange={async (provider, force) => {
                            await save_config({
                                ...config,
                                providerForcePercent: {
                                    ...(config.providerForcePercent ?? {}),
                                    [provider]: force,
                                },
                            });
                        }}
                        watchedMetrics={config.accountOverrides?.upcomingResetWatched}
                        onToggleWatched={(raw_label) => {
                            if (!dialog.instanceId) return;
                            const info = pluginInfos.find(
                                (p) => p.instanceId === dialog.instanceId,
                            );
                            const provider = info?.activeProviders[0];
                            if (!info || !provider) return;
                            const matching = snapshot_items(info).filter(
                                (it) => it.provider === provider && it.raw_label === raw_label,
                            );
                            const keys = Array.from(new Set(matching.map((it) => accountKey(it))));
                            if (keys.length === 0) return;
                            const watched_map =
                                config.accountOverrides?.upcomingResetWatched?.[provider];
                            const all_watched = keys.every(
                                (k) => watched_map?.[k]?.includes(raw_label) ?? false,
                            );
                            let next: AccountOverrides = config.accountOverrides ?? {};
                            if (all_watched) {
                                for (const k of keys) {
                                    next = remove_watched_metric(next, provider, k, raw_label);
                                }
                            } else {
                                for (const k of keys) {
                                    next = add_watched_metric(next, provider, k, raw_label);
                                }
                            }
                            void save_config({ ...config, accountOverrides: next });
                        }}
                    />
                )}
                {showCpaAdd && (
                    <CpaAddDialog
                        onClose={() => {
                            setShowCpaAdd(false);
                        }}
                    />
                )}
                {label_map_dialog && (
                    <CpaLabelMapDialog
                        instance_id={label_map_dialog.instance_id}
                        vendor_id={label_map_dialog.vendor_id}
                        account_name={label_map_dialog.account_name}
                        save_target={label_map_dialog.save_target}
                        config={config}
                        on_save_config={save_config}
                        on_close={() => {
                            set_label_map_dialog(null);
                        }}
                    />
                )}
                {deleteConfirmId && (
                    <ConfirmDelete
                        name={deleteConfirmName}
                        onCancel={() => {
                            setDeleteConfirmId(null);
                        }}
                        onConfirm={() => {
                            const info = pluginInfos.find((p) => p.instanceId === deleteConfirmId);
                            void save_config(
                                with_removed_connector(
                                    {
                                        ...config,
                                        plugins: config.plugins.filter(
                                            (pl) => pl.instanceId !== deleteConfirmId,
                                        ),
                                    },
                                    info?.metadata?.name,
                                ),
                            );
                            setDeleteConfirmId(null);
                        }}
                    />
                )}
                {removeCpaConfirmId && (
                    <ConfirmDelete
                        name={removeCpaConfirmName}
                        title="移除数据源"
                        confirmLabel="移除数据源"
                        onCancel={() => {
                            setRemoveCpaConfirmId(null);
                        }}
                        onConfirm={() => {
                            const info = pluginInfos.find(
                                (p) => p.instanceId === removeCpaConfirmId,
                            );
                            void save_config(
                                with_removed_connector(
                                    {
                                        ...config,
                                        plugins: config.plugins.filter(
                                            (pl) => pl.instanceId !== removeCpaConfirmId,
                                        ),
                                    },
                                    info?.metadata?.name,
                                ),
                            );
                            setRemoveCpaConfirmId(null);
                            if (editingCpaId === removeCpaConfirmId) {
                                setEditingCpaId(null);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
}

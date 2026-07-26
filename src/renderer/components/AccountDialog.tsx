import { useEffect } from "react";
import { SettingsForm } from "./SettingsForm";
import { AddAccountDialog } from "./AddAccountDialog";
import type { AddAccountParams } from "./AddAccountDialog";
import { Icon, VendorMark } from "./Icon";
import type { ConnectorCatalogEntry, ConnectorInfo } from "../../shared/types/ipc";
import type { ConnectorConfiguration, AccountOverrides } from "../../shared/types/config";
import { session_meta } from "../lib/session_meta";

export function AccountDialog({
    mode,
    instanceId,
    pluginName,
    pluginInfo,
    pluginConfig,
    pluginInfos,
    catalog,
    hasSecrets,
    onSave,
    onAddAccount,
    onClose,
    existingLabelMap,
    onSaveLabelMap,
    globalIntervalLabel,
    forcePercent,
    onForcePercentChange,
    watchedMetrics,
    onToggleWatched,
}: {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
    pluginInfo: ConnectorInfo | undefined;
    pluginConfig: ConnectorConfiguration | undefined;
    pluginInfos: ConnectorInfo[];
    /** t121: manifest catalog,透传给 AddAccountDialog 解析 auth。 */
    catalog: ConnectorCatalogEntry[];
    hasSecrets: Record<string, boolean> | undefined;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
        displayName?: string,
    ) => Promise<void>;
    onAddAccount: (params: AddAccountParams) => Promise<void>;
    onClose: () => void;
    existingLabelMap?: Readonly<Record<string, string>> | undefined;
    onSaveLabelMap?:
        | ((instanceId: string, map: Record<string, string>) => Promise<void>)
        | undefined;
    globalIntervalLabel: string;
    forcePercent?: boolean | undefined;
    onForcePercentChange?: ((provider: string, force: boolean) => Promise<void>) | undefined;
    /** t048: upcomingResetWatched 查表，透传给 SettingsForm 数据标签映射 bell。 */
    watchedMetrics?: AccountOverrides["upcomingResetWatched"];
    /** t048: 切换某 raw_label 的监控（account_keys 聚合由上层算）。 */
    onToggleWatched?: (raw_label: string) => void;
}) {
    const isEdit = mode === "edit";

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", h);
        return () => {
            window.removeEventListener("keydown", h);
        };
    }, [onClose]);

    return (
        <div className="acct-dialog-scrim" onMouseDown={onClose}>
            <div
                className="acct-dialog"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="acct-dialog-title"
            >
                {mode === "add" && !instanceId ? (
                    <AddAccountDialog
                        plugin_infos={pluginInfos}
                        catalog={catalog}
                        on_close={onClose}
                        on_save={onAddAccount}
                    />
                ) : (
                    <>
                        <div className="ad-head">
                            {isEdit && pluginInfo && (
                                <span className="ad-mark">
                                    <VendorMark
                                        id={pluginInfo.activeProviders[0] ?? "overview"}
                                        size={24}
                                    />
                                </span>
                            )}
                            <div className="ad-htext">
                                <div className="ad-title" id="acct-dialog-title">
                                    {isEdit ? "编辑账号" : "添加账号"}
                                </div>
                                <div className="ad-sub">
                                    {isEdit ? (pluginName ?? "新账号") : "选择要添加的服务"}
                                </div>
                            </div>
                            <button
                                className="ad-close"
                                onClick={onClose}
                                title="关闭"
                                type="button"
                            >
                                <Icon name="close" size={17} strokeWidth={2} />
                            </button>
                        </div>

                        <div className="ad-body">
                            {instanceId && pluginInfo && pluginConfig ? (
                                <SettingsForm
                                    instanceId={instanceId}
                                    displayName={pluginConfig.displayName}
                                    parameters={pluginInfo.metadata?.parameters ?? []}
                                    values={Object.fromEntries(
                                        Object.entries(pluginConfig.parameterValues).map(
                                            ([k, v]) => [k, String(v)],
                                        ),
                                    )}
                                    hasSecrets={hasSecrets ?? {}}
                                    endpoints={pluginInfo.metadata?.endpoints ?? {}}
                                    endpointValues={pluginConfig.endpointOverrides}
                                    refreshIntervalSeconds={pluginConfig.refreshIntervalSeconds}
                                    globalIntervalLabel={globalIntervalLabel}
                                    {...(pluginConfig.manualRefreshOnly
                                        ? { manualRefreshOnly: true }
                                        : {})}
                                    {...(pluginInfo.activeProviders[0]
                                        ? { providerId: pluginInfo.activeProviders[0] }
                                        : {})}
                                    onCookieLogin={async (id) => {
                                        try {
                                            const provider = pluginInfo.activeProviders[0];
                                            const meta = provider
                                                ? session_meta[provider]
                                                : undefined;
                                            const result =
                                                meta && provider
                                                    ? await window.usageboard.session.login({
                                                          instance_id: id,
                                                          provider,
                                                          login_url: meta.login_url,
                                                          cookie_names: meta.cookie_names,
                                                      })
                                                    : await window.usageboard.auth.cookieLogin(id);
                                            if (result.saved) {
                                                await window.usageboard.connector.refresh(id);
                                                await window.usageboard.config.get();
                                            }
                                            return result.saved;
                                        } catch {
                                            return false;
                                        }
                                    }}
                                    onSave={async (...args) => {
                                        await onSave(...args);
                                        onClose();
                                    }}
                                    existingLabelMap={existingLabelMap}
                                    onSaveLabelMap={onSaveLabelMap}
                                    forcePercent={forcePercent}
                                    onForcePercentChange={onForcePercentChange}
                                    watchedMetrics={watchedMetrics}
                                    onToggleWatched={onToggleWatched}
                                />
                            ) : mode === "edit" ? (
                                <div className="text-sm text-[var(--text-3)]">加载中...</div>
                            ) : (
                                <div className="text-sm text-[var(--text-3)]">
                                    暂不支持在此添加新账号
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

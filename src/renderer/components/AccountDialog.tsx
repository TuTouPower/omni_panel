import { useEffect } from "react";
import { SettingsForm } from "./SettingsForm";
import { AddAccountDialog } from "./AddAccountDialog";
import type { AddAccountParams } from "./AddAccountDialog";
import { Button } from "./ui/Button";
import { Dialog } from "./ui/Dialog";
import { Icon, VendorMark } from "./Icon";
import type { ConnectorCatalogEntry, ConnectorInfo } from "../../shared/types/ipc";
import type { ConnectorConfiguration, AccountOverrides } from "../../shared/types/config";
import { resolve_auth_method, resolve_auth_descriptor } from "../lib/auth-flow-registry";

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
    onDuplicate,
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
    onDuplicate?: (instanceId: string) => Promise<void>;
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

    if (mode === "add" && !instanceId) {
        return (
            <AddAccountDialog
                plugin_infos={pluginInfos}
                catalog={catalog}
                on_close={onClose}
                on_save={onAddAccount}
            />
        );
    }

    return (
        <Dialog open onClose={onClose} ariaLabel={isEdit ? "编辑账号" : "添加账号"}>
            <>
                <div className="flex min-w-0 items-center gap-3">
                    {isEdit && pluginInfo && (
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-primary-container)]">
                            <VendorMark
                                id={pluginInfo.activeProviders[0] ?? "overview"}
                                size={24}
                            />
                        </span>
                    )}
                    <div className="min-w-0">
                        <div className="text-[length:var(--text-title-sm)] font-semibold">
                            {isEdit ? "编辑账号" : "添加账号"}
                        </div>
                        <div className="mt-1 truncate text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                            {isEdit ? (pluginName ?? "新账号") : "选择要添加的服务"}
                        </div>
                    </div>
                    <Button
                        variant="icon"
                        size="sm"
                        className="ml-auto h-8 w-8 shrink-0 p-0"
                        onClick={onClose}
                        title="关闭"
                        aria-label="关闭"
                    >
                        <Icon name="close" size={17} strokeWidth={2} />
                    </Button>
                </div>

                <div className="mt-4">
                    {instanceId && pluginInfo && pluginConfig ? (
                        <SettingsForm
                            instanceId={instanceId}
                            displayName={pluginConfig.displayName}
                            parameters={pluginInfo.metadata?.parameters ?? []}
                            values={Object.fromEntries(
                                Object.entries(pluginConfig.parameterValues).map(([k, v]) => [
                                    k,
                                    String(v),
                                ]),
                            )}
                            hasSecrets={hasSecrets ?? {}}
                            endpoints={pluginInfo.metadata?.endpoints ?? {}}
                            endpointValues={pluginConfig.endpointOverrides}
                            refreshIntervalSeconds={pluginConfig.refreshIntervalSeconds}
                            globalIntervalLabel={globalIntervalLabel}
                            authMethod={resolve_auth_method(pluginInfo)}
                            authDescriptor={resolve_auth_descriptor(pluginInfo)}
                            loginUrl={
                                pluginInfo.metadata?.login_url ??
                                pluginInfo.metadata?.endpoints?.["login"] ??
                                undefined
                            }
                            {...(pluginConfig.manualRefreshOnly ? { manualRefreshOnly: true } : {})}
                            {...(pluginInfo.activeProviders[0]
                                ? { providerId: pluginInfo.activeProviders[0] }
                                : {})}
                            onSave={async (...args) => {
                                await onSave(...args);
                                onClose();
                            }}
                            onDuplicate={onDuplicate}
                            existingLabelMap={existingLabelMap}
                            onSaveLabelMap={onSaveLabelMap}
                            forcePercent={forcePercent}
                            onForcePercentChange={onForcePercentChange}
                            watchedMetrics={watchedMetrics}
                            onToggleWatched={onToggleWatched}
                        />
                    ) : mode === "edit" ? (
                        <div className="text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                            加载中...
                        </div>
                    ) : (
                        <div className="text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                            暂不支持在此添加新账号
                        </div>
                    )}
                </div>
            </>
        </Dialog>
    );
}

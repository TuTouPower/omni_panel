import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { AccountOverrides } from "../../shared/types/config";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { AccountError, ProviderUsageGroup } from "../lib/provider-usage";
import { ProviderAccountRow } from "./ProviderAccountRow";

interface ProviderAccountListProps {
    group: ProviderUsageGroup;
    collapsedAccounts?: Record<string, boolean> | undefined;
    onToggleAccount?: ((accountId: string) => void) | undefined;
    draggingId?: string | null | undefined;
    overId?: string | null | undefined;
    onDragStart?: ((accountId: string) => void) | undefined;
    onDragEnter?: ((accountId: string) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
    onReLogin?: ((provider: UsageProvider) => void) | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    accountLabelMaps?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
    providerLabelMaps?:
        | Readonly<Partial<Record<UsageProvider, Readonly<Record<string, string>>>>>
        | undefined;
    desensitizeRemarks?: boolean | undefined;
    forcePercent?: boolean | undefined;
    accountErrors?: Readonly<Map<string, AccountError>> | undefined;
    /** t043: 即将重置监控的 metric 白名单（provider → accountKey → raw_label[]）。 */
    watchedMetrics?: AccountOverrides["upcomingResetWatched"] | undefined;
    /** t043: 切换某个 (provider, accountKey, raw_label) 的即将重置监控。 */
    on_toggle_watched?:
        | ((target: { provider: UsageProvider; accountKey: string; raw_label: string }) => void)
        | undefined;
}

export function ProviderAccountList({
    group,
    collapsedAccounts,
    onToggleAccount,
    draggingId,
    overId,
    onDragStart,
    onDragEnter,
    onDragEnd,
    onReLogin: _onReLogin,
    barColorScheme,
    barStyle,
    labelMap,
    accountLabelMaps,
    providerLabelMaps,
    desensitizeRemarks = false,
    forcePercent = false,
    accountErrors,
    watchedMetrics,
    on_toggle_watched,
}: ProviderAccountListProps) {
    void _onReLogin;
    const per_provider_map = providerLabelMaps?.[group.provider] ?? {};

    return (
        <div className="provider-account-list">
            {group.accounts.map((account) => {
                const collapsed = collapsedAccounts?.[account.id] ?? false;
                const isDragging = draggingId === account.id;
                const isDragOver = overId === account.id && draggingId !== account.id;
                const connector_instance_id = account.periods[0]?.connectorInstanceId;
                const per_account_map = connector_instance_id
                    ? (accountLabelMaps?.[connector_instance_id] ?? {})
                    : {};
                const merged_label_map: Readonly<Record<string, string>> | undefined =
                    Object.keys(per_provider_map).length > 0 ||
                    Object.keys(per_account_map).length > 0
                        ? { ...labelMap, ...per_account_map, ...per_provider_map }
                        : labelMap;

                const watched_for_account = watchedMetrics?.[group.provider]?.[account.id];
                const watched_set = watched_for_account ? new Set(watched_for_account) : undefined;
                const toggle_for_account = on_toggle_watched
                    ? (raw_label: string) => {
                          on_toggle_watched({
                              provider: group.provider,
                              accountKey: account.id,
                              raw_label,
                          });
                      }
                    : undefined;

                if (!onToggleAccount) {
                    return (
                        <ProviderAccountRow
                            key={account.id}
                            account={account}
                            barColorScheme={barColorScheme}
                            barStyle={barStyle}
                            labelMap={merged_label_map}
                            desensitizeRemarks={desensitizeRemarks}
                            forcePercent={forcePercent}
                            error={accountErrors?.get(account.id)?.error}
                            watched_labels={watched_set}
                            on_toggle_watched={toggle_for_account}
                        />
                    );
                }
                const onToggle = () => {
                    onToggleAccount(account.id);
                };
                return (
                    <ProviderAccountRow
                        key={account.id}
                        account={account}
                        collapsed={collapsed}
                        onToggleCollapsed={onToggle}
                        dragging={isDragging}
                        dragOver={isDragOver}
                        onDragStart={
                            onDragStart
                                ? () => {
                                      onDragStart(account.id);
                                  }
                                : undefined
                        }
                        onDragEnter={
                            onDragEnter
                                ? () => {
                                      onDragEnter(account.id);
                                  }
                                : undefined
                        }
                        onDragEnd={onDragEnd}
                        barColorScheme={barColorScheme}
                        barStyle={barStyle}
                        labelMap={merged_label_map}
                        desensitizeRemarks={desensitizeRemarks}
                        forcePercent={forcePercent}
                        error={accountErrors?.get(account.id)?.error}
                        watched_labels={watched_set}
                        on_toggle_watched={toggle_for_account}
                    />
                );
            })}
        </div>
    );
}

import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { AccountError, ProviderUsageGroup } from "../lib/provider-usage";
import { ProviderAccountRow } from "./ProviderAccountRow";

interface ProviderAccountListProps {
    group: ProviderUsageGroup;
    collapsedAccounts?: Record<string, boolean> | undefined;
    onToggleAccount?: ((accountId: string) => void) | undefined;
    draggingId?: string | null | undefined;
    onDragStart?: ((accountId: string) => void) | undefined;
    onDragEnter?: ((accountId: string) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
    /**
     * t158: per-account re-login callback. Receiver is the row-level
     * (sourceInstanceId, accountId, provider) so settings.open can target the
     * exact failing instance instead of guessing by provider.
     */
    onReLogin?:
        | ((sourceInstanceId: string, accountId: string, provider: string) => void)
        | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    accountLabelMaps?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
    providerLabelMaps?:
        | Readonly<Partial<Record<string, Readonly<Record<string, string>>>>>
        | undefined;
    desensitizeRemarks?: boolean | undefined;
    forcePercent?: boolean | undefined;
    accountErrors?: Readonly<Map<string, AccountError>> | undefined;
    /** t222: sparkline 窗口偏好（1/7/30 天，全局共享）；缺省 7 天。 */
    sparklineWindowDays?: number | undefined;
    /** t222: 变更 sparkline 窗口时写回 config。 */
    onSparklineWindowChange?: ((days: number) => void) | undefined;
}

export function ProviderAccountList({
    group,
    collapsedAccounts,
    onToggleAccount,
    draggingId,
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
    sparklineWindowDays,
    onSparklineWindowChange,
}: ProviderAccountListProps) {
    const per_provider_map = providerLabelMaps?.[group.provider] ?? {};
    const handleRowReLogin = _onReLogin
        ? (sourceInstanceId: string, accountId: string) => {
              _onReLogin(sourceInstanceId, accountId, group.provider);
          }
        : undefined;

    return (
        <div
            className="grid items-stretch gap-3 [grid-template-columns:repeat(auto-fill,minmax(420px,1fr))]"
            data-testid="provider-account-list"
        >
            {group.accounts.map((account) => {
                const collapsed = collapsedAccounts?.[account.id] ?? false;
                const isDragging = draggingId === account.id;
                const connector_instance_id = account.periods[0]?.connectorInstanceId;
                const per_account_map = connector_instance_id
                    ? (accountLabelMaps?.[connector_instance_id] ?? {})
                    : {};
                const merged_label_map: Readonly<Record<string, string>> | undefined =
                    Object.keys(per_provider_map).length > 0 ||
                    Object.keys(per_account_map).length > 0
                        ? { ...labelMap, ...per_account_map, ...per_provider_map }
                        : labelMap;

                if (!onToggleAccount) {
                    return (
                        <ProviderAccountRow
                            key={account.id}
                            account={account}
                            provider={group.provider}
                            barColorScheme={barColorScheme}
                            barStyle={barStyle}
                            labelMap={merged_label_map}
                            desensitizeRemarks={desensitizeRemarks}
                            forcePercent={forcePercent}
                            error={accountErrors?.get(account.id)?.error}
                            onReLogin={handleRowReLogin}
                            sparklineWindowDays={sparklineWindowDays}
                            onSparklineWindowChange={onSparklineWindowChange}
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
                        provider={group.provider}
                        collapsed={collapsed}
                        onToggleCollapsed={onToggle}
                        dragging={isDragging}
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
                        onReLogin={handleRowReLogin}
                        sparklineWindowDays={sparklineWindowDays}
                        onSparklineWindowChange={onSparklineWindowChange}
                    />
                );
            })}
        </div>
    );
}

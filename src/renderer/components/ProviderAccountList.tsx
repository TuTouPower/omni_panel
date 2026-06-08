import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { ProviderUsageAccount, ProviderUsageGroup } from "../lib/provider-usage";
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
    onEditAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    onDisableAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    accountLabelMaps?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
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
    onEditAccount,
    onDisableAccount,
    barColorScheme,
    barStyle,
    labelMap,
    accountLabelMaps,
}: ProviderAccountListProps) {
    return (
        <>
            {group.accounts.map((account) => {
                const collapsed = collapsedAccounts?.[account.id] ?? false;
                const isDragging = draggingId === account.id;
                const isDragOver = overId === account.id && draggingId !== account.id;
                const per_account_map = accountLabelMaps?.[account.sourceInstanceId] ?? {};
                const merged_label_map =
                    Object.keys(per_account_map).length > 0
                        ? { ...labelMap, ...per_account_map }
                        : labelMap;
                if (!onToggleAccount) {
                    return (
                        <ProviderAccountRow
                            key={account.id}
                            account={account}
                            onEditAccount={onEditAccount}
                            onDisableAccount={onDisableAccount}
                            barColorScheme={barColorScheme}
                            barStyle={barStyle}
                            labelMap={merged_label_map}
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
                        onEditAccount={onEditAccount}
                        onDisableAccount={onDisableAccount}
                        barColorScheme={barColorScheme}
                        barStyle={barStyle}
                        labelMap={merged_label_map}
                    />
                );
            })}
        </>
    );
}

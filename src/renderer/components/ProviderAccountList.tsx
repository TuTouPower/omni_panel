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
    onHideOrDeleteAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
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
    onHideOrDeleteAccount,
    barColorScheme,
    barStyle,
    labelMap,
}: ProviderAccountListProps) {
    return (
        <>
            {group.accounts.map((account) => {
                const collapsed = collapsedAccounts?.[account.id] ?? false;
                const isDragging = draggingId === account.id;
                const isDragOver = overId === account.id && draggingId !== account.id;
                const is_cpa = account.periods.some((p) => p.source === "cpa");
                if (!onToggleAccount) {
                    return (
                        <ProviderAccountRow
                            key={account.id}
                            account={account}
                            onEditAccount={onEditAccount}
                            onDisableAccount={onDisableAccount}
                            onHideOrDeleteAccount={onHideOrDeleteAccount}
                            isCpaSource={is_cpa}
                            barColorScheme={barColorScheme}
                            barStyle={barStyle}
                            labelMap={labelMap}
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
                        onHideOrDeleteAccount={onHideOrDeleteAccount}
                        isCpaSource={is_cpa}
                        barColorScheme={barColorScheme}
                        barStyle={barStyle}
                        labelMap={labelMap}
                    />
                );
            })}
        </>
    );
}

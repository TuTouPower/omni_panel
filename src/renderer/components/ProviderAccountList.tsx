import type { ProviderUsageGroup } from "../lib/provider-usage";
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
}: ProviderAccountListProps) {
    return (
        <>
            {group.accounts.map((account) => {
                const collapsed = collapsedAccounts?.[account.id] ?? false;
                const isDragging = draggingId === account.id;
                const isDragOver = overId === account.id && draggingId !== account.id;
                if (!onToggleAccount) {
                    return <ProviderAccountRow key={account.id} account={account} />;
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
                    />
                );
            })}
        </>
    );
}

import type { ProviderUsageGroup } from "../lib/provider-usage";
import { ProviderAccountRow } from "./ProviderAccountRow";

interface ProviderAccountListProps {
    group: ProviderUsageGroup;
    collapsedAccounts?: Record<string, boolean>;
    onToggleAccount?: (accountId: string) => void;
}

export function ProviderAccountList({
    group,
    collapsedAccounts,
    onToggleAccount,
}: ProviderAccountListProps) {
    return (
        <>
            {group.accounts.map((account) => {
                const collapsed = collapsedAccounts?.[account.id] ?? false;
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
                    />
                );
            })}
        </>
    );
}

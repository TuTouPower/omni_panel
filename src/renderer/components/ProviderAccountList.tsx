import type { ProviderUsageGroup } from "../lib/provider-usage";
import { ProviderAccountRow } from "./ProviderAccountRow";

interface ProviderAccountListProps {
    group: ProviderUsageGroup;
}

export function ProviderAccountList({ group }: ProviderAccountListProps) {
    return (
        <>
            {group.accounts.map((account) => (
                <ProviderAccountRow key={account.id} account={account} />
            ))}
        </>
    );
}

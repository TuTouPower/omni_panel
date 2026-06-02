import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import { ProviderCard } from "./ProviderCard";

export interface ProviderError {
    displayName: string;
    error: string;
}

interface ProviderOverviewProps {
    groups: ProviderUsageGroup[];
    visibleProviders: UsageProvider[];
    providerErrors: Map<UsageProvider, ProviderError>;
    onRefreshProvider: (provider: UsageProvider) => void;
    expandedProviders?: Record<string, boolean>;
    onToggleExpandProvider?: (provider: UsageProvider) => void;
    disabledProviders?: Set<string>;
    onToggleDisableProvider?: (provider: UsageProvider) => void;
    onDeleteProvider?: (provider: UsageProvider) => void;
    draggingProvider?: UsageProvider | null;
    overProvider?: UsageProvider | null;
    onDragStart?: (provider: UsageProvider) => void;
    onDragEnter?: (provider: UsageProvider) => void;
    onDragEnd?: () => void;
}

export function ProviderOverview({
    groups,
    visibleProviders,
    providerErrors,
    onRefreshProvider,
    expandedProviders,
    onToggleExpandProvider,
    disabledProviders,
    onToggleDisableProvider,
    onDeleteProvider,
    draggingProvider,
    overProvider,
    onDragStart,
    onDragEnter,
    onDragEnd,
}: ProviderOverviewProps) {
    const groupsByProvider = new Map(groups.map((group) => [group.provider, group]));

    return (
        <>
            {visibleProviders.map((provider) => {
                const is_disabled = disabledProviders?.has(provider) ?? false;
                return (
                    <ProviderCard
                        key={provider}
                        provider={provider}
                        group={groupsByProvider.get(provider)}
                        connectorError={providerErrors.get(provider)}
                        onRefresh={onRefreshProvider}
                        expanded={
                            expandedProviders ? (expandedProviders[provider] ?? false) : undefined
                        }
                        onToggleExpand={onToggleExpandProvider}
                        disabled={is_disabled}
                        onToggleDisable={onToggleDisableProvider}
                        onDelete={onDeleteProvider}
                        dragging={draggingProvider === provider}
                        dragOver={overProvider === provider && draggingProvider !== provider}
                        onDragStart={onDragStart}
                        onDragEnter={onDragEnter}
                        onDragEnd={onDragEnd}
                    />
                );
            })}
        </>
    );
}

import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import type {
    AccountOverrides,
    UsageBarColorScheme,
    UsageBarStyle,
} from "../../shared/types/config";
import { ProviderCard } from "./ProviderCard";
import type { ToggleWatchedMetric } from "../hooks/use_watched_metric_toggler";

export interface ProviderError {
    displayName: string;
    error: string;
}

interface ProviderOverviewProps {
    groups: ProviderUsageGroup[];
    visibleProviders: UsageProvider[];
    providerErrors: Map<UsageProvider, ProviderError>;
    onRefreshProvider: (provider: UsageProvider) => void;
    expandedProviders?: Record<string, boolean> | undefined;
    onToggleExpandProvider?: ((provider: UsageProvider) => void) | undefined;
    onReLogin?: ((provider: UsageProvider) => void) | undefined;
    draggingProvider?: UsageProvider | null | undefined;
    overProvider?: UsageProvider | null | undefined;
    onDragStart?: ((provider: UsageProvider, rect?: DOMRect) => void) | undefined;
    onDragEnter?: ((provider: UsageProvider) => void) | undefined;
    onDragOver?:
        | ((provider: UsageProvider, clientX: number, clientY: number, rect: DOMRect) => void)
        | undefined;
    onDragEnd?: (() => void) | undefined;
    refreshingProviders?: Set<string> | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    accountLabelMaps?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
    providerLabelMaps?:
        | Readonly<Partial<Record<UsageProvider, Readonly<Record<string, string>>>>>
        | undefined;
    convergentTimeMinutes?: number | undefined;
    desensitizeRemarks?: boolean | undefined;
    providerForcePercent?: Readonly<Partial<Record<UsageProvider, boolean>>> | undefined;
    /** t046: account 级即将重置监控。 */
    watchedMetrics?: AccountOverrides["upcomingResetWatched"] | undefined;
    /** t046: 切换 (provider, accountKey, raw_label) 监控。 */
    on_toggle_watched?: ToggleWatchedMetric | undefined;
}

export function ProviderOverview({
    groups,
    visibleProviders,
    providerErrors,
    onRefreshProvider,
    expandedProviders,
    onToggleExpandProvider,
    onReLogin,
    draggingProvider,
    overProvider,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragEnd,
    refreshingProviders,
    barColorScheme,
    barStyle,
    labelMap,
    accountLabelMaps,
    providerLabelMaps,
    convergentTimeMinutes,
    desensitizeRemarks = false,
    providerForcePercent,
    watchedMetrics,
    on_toggle_watched,
}: ProviderOverviewProps) {
    const groupsByProvider = new Map(groups.map((group) => [group.provider, group]));

    return (
        <div className="overview-grid">
            {visibleProviders.map((provider) => {
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
                        onReLogin={onReLogin}
                        dragging={draggingProvider === provider}
                        dragOver={overProvider === provider && draggingProvider !== provider}
                        onDragStart={onDragStart}
                        onDragEnter={onDragEnter}
                        onDragOver={onDragOver}
                        onDragEnd={onDragEnd}
                        refreshing={refreshingProviders?.has(provider)}
                        barColorScheme={barColorScheme}
                        barStyle={barStyle}
                        labelMap={labelMap}
                        accountLabelMaps={accountLabelMaps}
                        providerLabelMaps={providerLabelMaps}
                        convergentTimeMinutes={convergentTimeMinutes}
                        desensitizeRemarks={desensitizeRemarks}
                        forcePercent={providerForcePercent?.[provider] === true}
                        watchedMetrics={watchedMetrics}
                        on_toggle_watched={on_toggle_watched}
                    />
                );
            })}
        </div>
    );
}

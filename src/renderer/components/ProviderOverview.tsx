import type { ReactNode } from "react";
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
    /**
     * t158: every failed connector instance sharing this provider.
     * Multi-instance setups (e.g. two GroK accounts) need per-instance routing for
     * the overview-level re-login fallback (first wins) plus per-row re-login buttons
     * for the rest.
     */
    instanceIds: string[];
}

interface ProviderOverviewProps {
    groups: ProviderUsageGroup[];
    visibleProviders: string[];
    overviewCardOrder?: readonly string[] | undefined;
    renderExtraCard?: ((card_id: string) => ReactNode) | undefined;
    providerErrors: Map<string, ProviderError>;
    onRefreshProvider: (provider: string) => void;
    expandedProviders?: Record<string, boolean> | undefined;
    onToggleExpandProvider?: ((provider: string) => void) | undefined;
    /** t250: 每 provider「概览 / N账号」受控开关（父级持久化）。 */
    l2OpenProviders?: Record<string, boolean> | undefined;
    onToggleL2Open?: ((provider: string) => void) | undefined;
    /**
     * t158: re-login callback now takes BOTH provider AND a specific instanceId
     * so multi-instance setups (e.g. two GroK accounts) can target the actual
     * failing instance, not the first connector with this provider.
     */
    onReLogin?: ((provider: string, instanceId: string) => void) | undefined;
    draggingProvider?: string | null | undefined;
    overProvider?: string | null | undefined;
    onDragStart?: ((provider: string, rect?: DOMRect) => void) | undefined;
    onDragEnter?: ((provider: string) => void) | undefined;
    onDragOver?:
        | ((provider: string, clientX: number, clientY: number, rect: DOMRect) => void)
        | undefined;
    onDragEnd?: (() => void) | undefined;
    refreshingProviders?: Set<string> | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    accountLabelMaps?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
    providerLabelMaps?:
        | Readonly<Partial<Record<string, Readonly<Record<string, string>>>>>
        | undefined;
    convergentTimeMinutes?: number | undefined;
    desensitizeRemarks?: boolean | undefined;
    providerForcePercent?: Readonly<Partial<Record<string, boolean>>> | undefined;
    /** t046: account 级即将重置监控。 */
    watchedMetrics?: AccountOverrides["upcomingResetWatched"] | undefined;
    /** t046: 切换 (provider, accountKey, raw_label) 监控。 */
    on_toggle_watched?: ToggleWatchedMetric | undefined;
}

export function ProviderOverview({
    groups,
    visibleProviders,
    overviewCardOrder,
    renderExtraCard,
    providerErrors,
    onRefreshProvider,
    expandedProviders,
    onToggleExpandProvider,
    l2OpenProviders,
    onToggleL2Open,
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
    const card_order = overviewCardOrder ?? visibleProviders;
    const visible_provider_set = new Set(visibleProviders);

    return (
        <div className="overview-grid">
            {card_order.map((card_id) => {
                if (visible_provider_set.has(card_id)) {
                    const provider = card_id;
                    return (
                        <ProviderCard
                            key={provider}
                            provider={provider}
                            group={groupsByProvider.get(provider)}
                            connectorError={providerErrors.get(provider)}
                            onRefresh={onRefreshProvider}
                            expanded={
                                expandedProviders
                                    ? (expandedProviders[provider] ?? false)
                                    : undefined
                            }
                            onToggleExpand={onToggleExpandProvider}
                            l2Open={
                                l2OpenProviders ? (l2OpenProviders[provider] ?? false) : undefined
                            }
                            onToggleL2Open={onToggleL2Open}
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
                }
                return renderExtraCard?.(card_id) ?? null;
            })}
        </div>
    );
}

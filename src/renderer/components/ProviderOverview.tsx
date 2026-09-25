import { memo, useMemo, type ReactNode } from "react";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import { ProviderCard } from "./ProviderCard";

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
    onDragStart?: ((provider: string, rect?: DOMRect) => void) | undefined;
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
}

// A117: memo 化 ProviderOverview 并在内部 useMemo 衍生 Map/Set，杜绝无谓重渲
export const ProviderOverview = memo(function ProviderOverview({
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
    onDragStart,
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
}: ProviderOverviewProps) {
    const groupsByProvider = useMemo(
        () => new Map(groups.map((group) => [group.provider, group])),
        [groups],
    );
    const card_order = overviewCardOrder ?? visibleProviders;
    const visible_provider_set = useMemo(() => new Set(visibleProviders), [visibleProviders]);

    return (
        <div
            className="grid items-stretch gap-3 [grid-template-columns:repeat(auto-fill,minmax(420px,1fr))]"
            data-testid="overview-grid"
        >
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
                                    ? (expandedProviders[provider] ?? true)
                                    : undefined
                            }
                            onToggleExpand={onToggleExpandProvider}
                            l2Open={
                                l2OpenProviders ? (l2OpenProviders[provider] ?? false) : undefined
                            }
                            onToggleL2Open={onToggleL2Open}
                            onReLogin={onReLogin}
                            dragging={draggingProvider === provider}
                            onDragStart={onDragStart}
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
                        />
                    );
                }
                return renderExtraCard?.(card_id) ?? null;
            })}
        </div>
    );
});

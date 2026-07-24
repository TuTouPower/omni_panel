/* eslint-disable react-hooks/rules-of-hooks */
import { useMemo } from "react";
import type { ConnectorInfo } from "../../shared/types/ipc";
import type { AccountLabels, AccountOverrides } from "../../shared/types/config";
import {
    build_provider_usage_groups,
    visible_providers_from_groups,
    apply_account_overrides,
    apply_account_labels,
    collect_upcoming_resets,
    buildAccountErrors,
    type AccountError,
    type ProviderUsageGroup,
    type UpcomingResetItem,
} from "../lib/provider-usage";

export interface UsePopupDerivedParams {
    plugins: ConnectorInfo[];
    account_overrides: AccountOverrides | undefined;
    account_labels: AccountLabels | undefined;
    upcoming_reset_threshold_percent: number | null | undefined;
    provider_order: string[];
    active_tab: string;
    account_orders: Record<string, string[]>;
}

export interface UsePopupDerivedResult {
    rawGroups: ProviderUsageGroup[];
    providerGroups: ProviderUsageGroup[];
    visibleProviders: string[];
    upcomingItems: UpcomingResetItem[];
    orderedProviders: string[];
    providerErrors: Map<string, { displayName: string; error: string }>;
    accountErrors: Map<string, AccountError>;
    activeGroup: ProviderUsageGroup | undefined;
    orderedActiveGroup: ProviderUsageGroup | undefined;
}

// 派生 memos：把 plugins + config + 顺序状态聚合为渲染所需的分组与错误。
// 行为保持与原 PopupView 内联 memos 一致；memo 依赖链逐项对齐。
export function use_popup_derived(params: UsePopupDerivedParams): UsePopupDerivedResult {
    const {
        plugins,
        account_overrides,
        account_labels,
        upcoming_reset_threshold_percent,
        provider_order,
        active_tab,
        account_orders,
    } = params;

    const rawGroups = useMemo(() => build_provider_usage_groups(plugins), [plugins]);
    const providerGroups = useMemo(
        () =>
            apply_account_labels(
                apply_account_overrides(rawGroups, account_overrides),
                account_labels,
            ),
        [rawGroups, account_overrides, account_labels],
    );
    const visibleProviders = useMemo(
        () => visible_providers_from_groups(rawGroups, plugins),
        [rawGroups, plugins],
    );
    const upcomingItems = useMemo(
        () =>
            collect_upcoming_resets(providerGroups, {
                thresholdPercent: upcoming_reset_threshold_percent,
                watchedMetrics: account_overrides?.upcomingResetWatched,
            }),
        [providerGroups, upcoming_reset_threshold_percent, account_overrides],
    );

    // Apply persisted order to visible providers
    const orderedProviders = useMemo(() => {
        if (provider_order.length === 0) return visibleProviders;
        const orderSet = new Set(provider_order);
        const ordered = provider_order.filter((p) => visibleProviders.includes(p));
        const remaining = visibleProviders.filter((p) => !orderSet.has(p));
        return [...ordered, ...remaining];
    }, [visibleProviders, provider_order]);
    const providerErrors = useMemo(() => {
        const map = new Map<string, { displayName: string; error: string }>();
        for (const c of plugins) {
            if (c.snapshot.status !== "failed") continue;
            for (const p of c.activeProviders) {
                if (!map.has(p))
                    map.set(p, { displayName: c.displayName, error: c.snapshot.error });
            }
        }
        return map;
    }, [plugins]);
    const accountErrors = useMemo(() => buildAccountErrors(providerGroups), [providerGroups]);

    const activeGroup =
        active_tab === "overview"
            ? undefined
            : providerGroups.find((group) => group.provider === active_tab);

    // Apply account order to active group
    const orderedActiveGroup = useMemo(() => {
        if (!activeGroup) return undefined;
        const tabKey = active_tab;
        const order = account_orders[tabKey];
        if (!order || order.length === 0) return activeGroup;
        const orderSet = new Set(order);
        const ordered = order.flatMap((id) => {
            const found = activeGroup.accounts.find((a) => a.id === id);
            return found ? [found] : [];
        });
        const remaining = activeGroup.accounts.filter((a) => !orderSet.has(a.id));
        return {
            ...activeGroup,
            accounts: [...ordered, ...remaining],
        };
    }, [activeGroup, account_orders, active_tab]);

    return {
        rawGroups,
        providerGroups,
        visibleProviders,
        upcomingItems,
        orderedProviders,
        providerErrors,
        accountErrors,
        activeGroup,
        orderedActiveGroup,
    };
}

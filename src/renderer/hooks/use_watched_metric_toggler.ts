/* eslint-disable react-hooks/rules-of-hooks */
import { useCallback } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { AccountOverrides, AppConfiguration } from "../../shared/types/config";
import { add_watched_metric, remove_watched_metric } from "../lib/account-overrides";

export interface UseWatchedMetricTogglerParams {
    account_overrides: AccountOverrides | undefined;
    set_account_overrides: (overrides: AccountOverrides | undefined) => void;
    patchConfig: (patch: Partial<AppConfiguration>) => void;
}

export interface WatchedMetricTarget {
    provider: UsageProvider;
    accountKey: string;
    raw_label: string;
}

export type ToggleWatchedMetric = (target: WatchedMetricTarget) => void;

// t043：切换某 (provider, accountKey, raw_label) 的「即将重置」监控。
// 默认全关；点击后显式加入 / 移出 watched 集合。
export function use_watched_metric_toggler(
    params: UseWatchedMetricTogglerParams,
): ToggleWatchedMetric {
    const { account_overrides, set_account_overrides, patchConfig } = params;
    return useCallback(
        (target: WatchedMetricTarget) => {
            const current = account_overrides;
            const watched_list =
                current?.upcomingResetWatched?.[target.provider]?.[target.accountKey];
            const is_watched = watched_list?.includes(target.raw_label) ?? false;
            const next_overrides = is_watched
                ? remove_watched_metric(
                      current ?? {},
                      target.provider,
                      target.accountKey,
                      target.raw_label,
                  )
                : add_watched_metric(current, target.provider, target.accountKey, target.raw_label);
            set_account_overrides(next_overrides);
            patchConfig({ accountOverrides: next_overrides });
        },
        [account_overrides, patchConfig, set_account_overrides],
    );
}

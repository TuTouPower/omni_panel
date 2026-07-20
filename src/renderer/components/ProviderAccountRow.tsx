import { memo, useEffect, useRef, useState } from "react";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { TrendPoint } from "../../shared/types/ipc";
import { createLogger } from "../../shared/lib/logger";
import type { ProviderUsageAccount } from "../lib/provider-usage";
import { format_usage_period_label } from "../lib/provider-usage";
import { relative_time } from "../lib/utils";
import { DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";
import { CollapsibleCard } from "./CollapsibleCard";
import { TrendSparkline } from "./TrendSparkline";
import { UsageBarList } from "./UsageBarList";
import { DragGrip } from "./DragGrip";

const log = createLogger("renderer:provider-account-row");

interface ProviderAccountRowProps {
    account: ProviderUsageAccount;
    collapsed?: boolean | undefined;
    onToggleCollapsed?: (() => void) | undefined;
    dragging?: boolean | undefined;
    dragOver?: boolean | undefined;
    onDragStart?: (() => void) | undefined;
    onDragEnter?: (() => void) | undefined;
    onDragEnd?: (() => void) | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    desensitizeRemarks?: boolean | undefined;
    forcePercent?: boolean | undefined;
}

export const ProviderAccountRow = memo(function ProviderAccountRow({
    account,
    collapsed = false,
    onToggleCollapsed,
    dragging,
    dragOver,
    onDragStart,
    onDragEnter,
    onDragEnd,
    barColorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
    desensitizeRemarks = false,
    forcePercent = false,
}: ProviderAccountRowProps) {
    const display_label = desensitizeRemarks ? "" : account.accountLabel;

    // Sparkline cache: key = `${provider}||${accountId}||${metricId}`.
    // `||` separator avoids collision with metricId values like "tavily:monthly_usage".
    // useRef so collapses/re-expands don't re-fetch. Failure not cached (allows retry).
    const trend_cache_ref = useRef<Map<string, (TrendPoint | null)[]>>(new Map());
    const [trend_data_by_metric, set_trend_data_by_metric] = useState<
        Record<string, (TrendPoint | null)[]>
    >({});

    // 懒查:展开时触发。缓存命中不发 IPC,未命中调 trend:get 写回;失败不写缓存。
    useEffect(() => {
        if (collapsed) return;
        if (account.periods.length === 0) return;
        const trend_api = window.usageboard.trend;

        let cancelled = false;
        const fetch_one = async (period: (typeof account.periods)[number]) => {
            const cache_key = `${period.provider}||${period.accountId}||${period.id}`;
            const cached = trend_cache_ref.current.get(cache_key);
            if (cached) {
                if (cancelled) return;
                set_trend_data_by_metric((prev) =>
                    prev[cache_key] === cached ? prev : { ...prev, [cache_key]: cached },
                );
                return;
            }
            try {
                const result = await trend_api.get(period.provider, period.accountId, period.id);
                if (cancelled) return;
                trend_cache_ref.current.set(cache_key, result);
                set_trend_data_by_metric((prev) => ({ ...prev, [cache_key]: result }));
            } catch (err) {
                if (cancelled) return;
                log.warn("trend:get failed", {
                    key: cache_key,
                    err: err instanceof Error ? err.message : String(err),
                });
            }
        };

        for (const period of account.periods) {
            void fetch_one(period);
        }
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- account.periods is the precise dep; full account would cause spurious refetches
    }, [collapsed, account.periods]);

    const header = (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {onDragStart && <DragGrip />}
            <div>
                {display_label ? <div className="card-name">{display_label}</div> : null}
                <div className="rel-time">
                    {account.updatedAt ? relative_time(account.updatedAt) : ""}
                    {account.stale && <span className="stale-badge">已过期</span>}
                </div>
            </div>
        </div>
    );

    const card_class =
        (dragging ? " dragging" : "") +
        (dragOver ? " drag-over" : "") +
        (account.stale ? " stale" : "");

    const drag_root_props = onDragStart
        ? {
              draggable: true as const,
              onDragStart,
              onDragEnter,
              onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
              },
              onDragEnd,
          }
        : undefined;

    const can_collapse = onToggleCollapsed !== undefined;

    return (
        <CollapsibleCard
            header={header}
            collapsed={can_collapse ? collapsed : false}
            onToggle={can_collapse ? onToggleCollapsed : () => undefined}
            toggleLabel={
                collapsed ? `展开 ${display_label || "账号"}` : `折叠 ${display_label || "账号"}`
            }
            className={card_class || undefined}
            rootProps={drag_root_props}
        >
            <UsageBarList
                periods={account.periods}
                colorScheme={barColorScheme}
                barStyle={barStyle}
                labelMap={labelMap}
                forcePercent={forcePercent}
            />
            {!collapsed &&
                account.periods.map((period) => {
                    const cache_key = `${period.provider}||${period.accountId}||${period.id}`;
                    const data = trend_data_by_metric[cache_key];
                    const label = format_usage_period_label(
                        period.raw_label,
                        period.name,
                        labelMap,
                    );
                    return (
                        <TrendSparkline
                            key={`trend-${period.id}`}
                            data={data ?? []}
                            label={label}
                        />
                    );
                })}
        </CollapsibleCard>
    );
});

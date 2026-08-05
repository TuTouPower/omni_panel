import { memo, useEffect, useRef, useState } from "react";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { TrendPoint } from "../../shared/types/ipc";
import { createLogger } from "../../shared/lib/logger";
import { is_auth_error } from "../../shared/lib/auth-error";
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
    /** t158: provider context for the row (group.provider); needed to route re-login target. */
    provider?: string | undefined;
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
    error?: string | undefined;
    /**
     * t158: per-account re-login callback. Caller receives the specific
     * (sourceInstanceId, accountId, provider) trio so the settings dialog
     * opens on the failing instance — bypassing the provider-level
     * "first active connector" match that previously misrouted multi-instance
     * setups.
     */
    onReLogin?:
        | ((sourceInstanceId: string, accountId: string, provider: string) => void)
        | undefined;
    /** t043: 当前 account 下已监控的 raw_label 集合。 */
    watched_labels?: ReadonlySet<string> | undefined;
    /** t043: 切换某个 raw_label 的即将重置监控。 */
    on_toggle_watched?: ((raw_label: string) => void) | undefined;
}

export const ProviderAccountRow = memo(function ProviderAccountRow({
    account,
    provider = "",
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
    error: _error,
    onReLogin: _onReLogin,
    watched_labels,
    on_toggle_watched,
}: ProviderAccountRowProps) {
    const display_label = desensitizeRemarks ? "" : account.accountLabel;

    // Sparkline cache: key = `${provider}||${accountId}||${metricId}||${days}`.
    // `||` separator avoids collision with metricId values like "tavily:monthly_usage".
    // useRef so collapses/re-expands don't re-fetch. Failure not cached (allows retry).
    // t208: key 含 days，不同窗口分别缓存。
    const trend_cache_ref = useRef<Map<string, (TrendPoint | null)[]>>(new Map());
    const [trend_data_by_metric, set_trend_data_by_metric] = useState<
        Record<string, (TrendPoint | null)[]>
    >({});
    // t208: sparkline 窗口选择（1/7/30 天），session 内状态，不持久化。
    const [trend_days, set_trend_days] = useState(7);

    // 懒查:展开时触发。缓存命中不发 IPC,未命中调 trend 取回写回;失败不写缓存。
    // t196 AC5: 一次 getBulk 取回该账号全部指标周期，替代 N 个并行 trend:get。
    useEffect(() => {
        if (collapsed) return;
        if (account.periods.length === 0) return;
        const trend_api = window.usageboard.trend;

        let cancelled = false;
        const fetch_bulk = async () => {
            const missing: { cache_key: string; period: (typeof account.periods)[number] }[] = [];
            for (const period of account.periods) {
                const cache_key = `${period.provider}||${period.accountId}||${period.id}||${String(trend_days)}`;
                const cached = trend_cache_ref.current.get(cache_key);
                if (cached) {
                    set_trend_data_by_metric((prev) =>
                        prev[cache_key] === cached ? prev : { ...prev, [cache_key]: cached },
                    );
                } else {
                    missing.push({ cache_key, period });
                }
            }
            if (missing.length === 0) return;
            try {
                // trend 查询键是 observation 的 metric_id（connector 构造的完整键，如
                // `claude:acc-1:five_hour`），不是 raw_label（短标签）也不是复合 period.id。
                // bulk 请求按 metric_id 查询，响应按 metric_id 映射回 cache_key。
                const metric_id_to_cache_key = new Map(
                    missing.map((m) => [m.period.metric_id, m.cache_key] as const),
                );
                const bulk = await trend_api.getBulk({
                    provider: account.periods[0]?.provider ?? "",
                    account_id: account.periods[0]?.accountId ?? "",
                    source_instance_id: account.periods[0]?.sourceInstanceId ?? "",
                    periods: missing.map(({ period }) => ({
                        metric_id: period.metric_id,
                        days: trend_days,
                    })),
                });
                if (cancelled) return;
                const entries: [string, (TrendPoint | null)[]][] = [];
                for (const item of bulk.series) {
                    const cache_key = metric_id_to_cache_key.get(item.metric_id);
                    if (!cache_key) continue;
                    trend_cache_ref.current.set(cache_key, item.series);
                    entries.push([cache_key, item.series]);
                }
                if (entries.length > 0) {
                    set_trend_data_by_metric((prev) => {
                        const next = { ...prev };
                        for (const [key, series] of entries) next[key] = series;
                        return next;
                    });
                }
            } catch (err) {
                if (cancelled) return;
                log.warn("trend:getBulk failed", {
                    key: missing.map((m) => m.cache_key).join(","),
                    err: err instanceof Error ? err.message : String(err),
                });
            }
        };
        void fetch_bulk();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- account.periods is the precise dep; full account would cause spurious refetches
    }, [collapsed, account.periods, trend_days]);

    // t172: 重新登录入口只对凭证失效类错误显示；连接超时/5xx/解析失败等
    // 非认证错误只展示「已过期」/「采集失败」badge。
    const show_relogin_button =
        _error !== undefined &&
        is_auth_error(_error) &&
        _onReLogin !== undefined &&
        provider !== "";
    const header = (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {onDragStart && <DragGrip />}
            <div>
                {display_label ? <div className="card-name">{display_label}</div> : null}
                <div className="rel-time">
                    {/* t174: stale 副本保留原数据时间后，相对时间取 per-账号
                        observedAt（数据真实年龄）而非 connector 级 updatedAt
                        （部分失败下会被成功账号拉高）；placeholder 无
                        observedAt 时回退 updatedAt。 */}
                    {account.observedAt
                        ? relative_time(account.observedAt)
                        : account.updatedAt
                          ? relative_time(account.updatedAt)
                          : ""}
                    {account.stale && <span className="stale-badge">已过期</span>}
                    {_error && (
                        <span className="error-badge" title={_error}>
                            采集失败
                        </span>
                    )}
                </div>
            </div>
            {show_relogin_button && (
                <button
                    type="button"
                    className="row-relogin-btn"
                    onClick={() => {
                        _onReLogin(account.sourceInstanceId, account.accountId, provider);
                    }}
                >
                    重新登录
                </button>
            )}
        </div>
    );

    const card_class = (dragging ? " dragging" : "") + (dragOver ? " drag-over" : "");

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
            collapsible={can_collapse}
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
                watched_labels={watched_labels}
                on_toggle_watched={on_toggle_watched}
            />
            {!collapsed && account.periods.length > 0 && (
                <div className="trend-window-picker" role="group" aria-label="趋势窗口">
                    {[1, 7, 30].map((d) => (
                        <button
                            key={d}
                            type="button"
                            className={"trend-window-btn" + (trend_days === d ? " active" : "")}
                            aria-pressed={trend_days === d}
                            onClick={() => {
                                set_trend_days(d);
                            }}
                        >
                            {d === 1 ? "1天" : d === 7 ? "7天" : "30天"}
                        </button>
                    ))}
                </div>
            )}
            {!collapsed &&
                account.periods.map((period) => {
                    const cache_key = `${period.provider}||${period.accountId}||${period.id}||${String(trend_days)}`;
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

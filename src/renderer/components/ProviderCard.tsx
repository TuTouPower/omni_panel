import { memo, useMemo, useCallback } from "react";
import type { ProviderUsageAccount, ProviderUsageGroup } from "../lib/provider-usage";
import {
    PROVIDER_LABELS,
    build_overview_for_group,
    resolve_convergent_time,
} from "../lib/provider-usage";
import { relative_time } from "../lib/utils";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import { DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";
import type { ProviderError } from "./ProviderOverview";
import { Icon, VendorMark } from "./Icon";
import { Badge } from "./ui/Badge";
import { Button } from "./ui/Button";
import { Segmented } from "./ui/Segmented";
import { CollapsibleCard } from "./CollapsibleCard";
import { UsageBarList } from "./UsageBarList";
import { DragGrip } from "./DragGrip";
import { is_auth_error, ProviderCardState, ProviderCardErrorBanner } from "./provider_card_states";
import { ProviderCardOverview, ProviderCardAccountDetail } from "./provider_card_content";

interface ProviderCardProps {
    provider: string;
    group?: ProviderUsageGroup | undefined;
    connectorError?: ProviderError | undefined;
    onRefresh?: ((provider: string) => void) | undefined;
    expanded?: boolean | undefined;
    onToggleExpand?: ((provider: string) => void) | undefined;
    /** t250: 「概览 / N账号」分段开关（受控，由父级持久化）。 */
    l2Open?: boolean | undefined;
    onToggleL2Open?: ((provider: string) => void) | undefined;
    dragging?: boolean | undefined;
    onDragStart?: ((provider: string, rect?: DOMRect) => void) | undefined;
    onDragOver?:
        | ((provider: string, clientX: number, clientY: number, rect: DOMRect) => void)
        | undefined;
    onDragEnd?: (() => void) | undefined;
    refreshing?: boolean | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    accountLabelMaps?: Readonly<Record<string, Readonly<Record<string, string>>>> | undefined;
    providerLabelMaps?:
        | Readonly<Partial<Record<string, Readonly<Record<string, string>>>>>
        | undefined;
    /**
     * t158: re-login callback takes BOTH provider and a specific instanceId
     * so multi-instance 401 can target the failing account (not the first
     * connector with this provider).
     */
    onReLogin?: ((provider: string, instanceId: string) => void) | undefined;
    convergentTimeMinutes?: number | undefined;
    desensitizeRemarks?: boolean | undefined;
    forcePercent?: boolean | undefined;
}

type CardStatus = "loading" | "ready" | "failed" | "empty";

export const ProviderCard = memo(function ProviderCard({
    provider,
    group,
    connectorError,
    onRefresh,
    expanded,
    onToggleExpand,
    l2Open = false,
    onToggleL2Open,
    dragging,
    onDragStart,
    onDragOver,
    onDragEnd,
    refreshing: is_refreshing = false,
    barColorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
    accountLabelMaps,
    providerLabelMaps,
    onReLogin,
    convergentTimeMinutes,
    desensitizeRemarks = false,
    forcePercent = false,
}: ProviderCardProps) {
    const accountCount = group?.accountCount ?? 0;
    const hasUsage = (group?.periods.length ?? 0) > 0;
    const label = group?.label ?? PROVIDER_LABELS[provider] ?? provider;
    const hasError = connectorError !== undefined;
    const isFailed = hasError && !hasUsage;
    const has_stale_error = hasError && hasUsage;
    const is_auth = hasError && is_auth_error(connectorError.error);
    const hasAccounts = group !== undefined && group.accounts.length > 0;
    const card_status: CardStatus = isFailed
        ? "failed"
        : is_refreshing && !hasUsage
          ? "loading"
          : hasUsage
            ? "ready"
            : "empty";
    const card_class = dragging ? " opacity-45" : "";

    // t250: l2open 由父级受控（l2Open props + onToggleL2Open 回调）持久化。
    // 展开状态变化时父级负责把 collapsed 卡片强制回概览。

    const is_multi = accountCount > 1;
    const label_map_for_connector = useCallback(
        (connector_instance_id: string | undefined, source_instance_id?: string) => {
            const per_account =
                (connector_instance_id ? accountLabelMaps?.[connector_instance_id] : undefined) ??
                (source_instance_id ? accountLabelMaps?.[source_instance_id] : undefined);
            const per_provider = providerLabelMaps?.[provider];
            return per_account || per_provider
                ? { ...(labelMap ?? {}), ...(per_account ?? {}), ...(per_provider ?? {}) }
                : labelMap;
        },
        [provider, labelMap, accountLabelMaps, providerLabelMaps],
    );

    const label_map_for_account = (account: ProviderUsageAccount) =>
        label_map_for_connector(
            account.periods[0]?.connectorInstanceId,
            account.periods[0]?.sourceInstanceId,
        );

    const overview_periods = useMemo(
        () =>
            group
                ? build_overview_for_group(group, convergentTimeMinutes, labelMap, (period) =>
                      label_map_for_connector(period.connectorInstanceId, period.sourceInstanceId),
                  )
                : [],
        [group, convergentTimeMinutes, labelMap, label_map_for_connector],
    );
    const overview_updated_at = useMemo(
        () =>
            is_multi
                ? resolve_convergent_time(
                      overview_periods.map((period) => period.updatedAt),
                      convergentTimeMinutes !== undefined
                          ? convergentTimeMinutes * 60 * 1000
                          : undefined,
                  )
                : (group?.updatedAt ?? null),
        [group?.updatedAt, is_multi, overview_periods, convergentTimeMinutes],
    );

    const updated_text = overview_updated_at ? relative_time(overview_updated_at) : "";

    const header = (
        <>
            {onDragStart && <DragGrip iconSize={18} />}
            <VendorMark id={provider} size={26} />
            <span
                className="truncate text-[length:var(--text-title-sm)] font-[650] tracking-[-0.01em] text-[var(--color-on-surface)]"
                data-testid="card-name"
            >
                {label}
            </span>
            {accountCount > 1 && expanded === false && (
                <Badge variant="accent">{String(accountCount)}账号</Badge>
            )}
            {accountCount > 1 && expanded !== false && (
                <Segmented
                    size="sm"
                    className="ml-px shrink-0"
                    value={l2Open ? "detail" : "overview"}
                    options={[
                        { value: "overview", label: "概览", title: "概览" },
                        {
                            value: "detail",
                            label: `${String(accountCount)}账号`,
                            title: "账号明细",
                        },
                    ]}
                    onChange={(next) => {
                        if (next === "overview" && l2Open) onToggleL2Open?.(provider);
                        if (next === "detail" && !l2Open) onToggleL2Open?.(provider);
                    }}
                />
            )}
            {is_refreshing && (
                <span
                    className="shrink-0 whitespace-nowrap text-[length:var(--text-body-sm)] font-[450] text-[var(--color-on-surface-muted)]"
                    data-testid="rel-time"
                >
                    刷新中…
                </span>
            )}
            {!is_refreshing && hasUsage && (
                <span
                    className="shrink-0 whitespace-nowrap text-[length:var(--text-body-sm)] font-[450] text-[var(--color-on-surface-muted)]"
                    data-testid="rel-time"
                >
                    {updated_text}
                </span>
            )}
            {!is_refreshing && hasUsage && group && group.stale && (
                <span className="inline-flex items-center gap-2 whitespace-nowrap text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                    <span
                        className="ml-2 font-[650] text-[var(--color-warning)]"
                        data-testid="stale-badge"
                    >
                        已过期
                    </span>
                </span>
            )}
        </>
    );

    const tools = (
        <>
            {onRefresh !== undefined && (
                <Button
                    className="h-8 w-8 p-0"
                    variant="icon"
                    size="sm"
                    title={`刷新 ${label}`}
                    aria-label={`刷新 ${label}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRefresh(provider);
                    }}
                >
                    <Icon
                        name="refresh"
                        size={16}
                        {...(is_refreshing ? { className: "animate-spin" } : {})}
                    />
                </Button>
            )}
        </>
    );

    const drag_root_props = onDragStart
        ? {
              draggable: true as const,
              onDragStart: (e: React.DragEvent<HTMLDivElement>) => {
                  onDragStart(provider, e.currentTarget.getBoundingClientRect());
              },
              onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  if (onDragOver) {
                      onDragOver(
                          provider,
                          e.clientX,
                          e.clientY,
                          e.currentTarget.getBoundingClientRect(),
                      );
                  }
              },
              onDragEnd: onDragEnd,
              "data-card-id": provider,
          }
        : { "data-card-id": provider };

    // Collapsible content. Failed-with-cached-data renders an error banner above
    // the (stale) usage so failures surface on the main panel instead of only
    // in account settings.
    const usage_content =
        is_multi && l2Open && group ? (
            <ProviderCardAccountDetail
                group={group}
                barColorScheme={barColorScheme}
                barStyle={barStyle}
                labelMapForAccount={label_map_for_account}
                desensitizeRemarks={desensitizeRemarks}
                forcePercent={forcePercent}
            />
        ) : is_multi && !l2Open ? (
            <ProviderCardOverview
                isRefreshing={is_refreshing}
                overviewPeriods={overview_periods}
                barColorScheme={barColorScheme}
                barStyle={barStyle}
                forcePercent={forcePercent}
            />
        ) : group ? (
            group.accounts.map((account) => (
                <UsageBarList
                    key={account.id}
                    periods={account.periods}
                    colorScheme={barColorScheme}
                    barStyle={barStyle}
                    labelMap={label_map_for_account(account)}
                    forcePercent={forcePercent}
                />
            ))
        ) : null;

    const collapse_children =
        isFailed || !hasUsage ? (
            <ProviderCardState
                provider={provider}
                connectorError={connectorError}
                isFailed={isFailed}
                isAuth={is_auth}
                hasUsage={hasUsage}
                onReLogin={onReLogin}
                onRefresh={onRefresh}
            />
        ) : has_stale_error ? (
            <>
                <ProviderCardErrorBanner
                    provider={provider}
                    connectorError={connectorError}
                    onRefresh={onRefresh}
                />
                {usage_content}
            </>
        ) : (
            usage_content
        );

    // Auth failures surface a "re-login" action; collapsing would hide the only
    // recovery path, so keep them expanded when a toggle handler is present.
    const can_collapse =
        onToggleExpand !== undefined && (hasAccounts || isFailed) && !(isFailed && is_auth);

    // Unified: always use CollapsibleCard, even for non-collapsible (failed/no-data)
    return (
        <CollapsibleCard
            header={header}
            tools={tools}
            collapsed={can_collapse ? !expanded : false}
            collapsible={can_collapse}
            onToggle={
                can_collapse
                    ? () => {
                          onToggleExpand(provider);
                      }
                    : () => undefined
            }
            className={card_class || undefined}
            dataStatus={card_status}
            rootProps={drag_root_props}
        >
            {collapse_children}
        </CollapsibleCard>
    );
});

import { memo, useState, useMemo } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
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
import { VENDOR_AUTH_MAP } from "./AddAccountDialog";
import { CollapsibleCard } from "./CollapsibleCard";
import { CardActionMenu } from "./CardActionMenu";
import type { CardActionMenuItem } from "./CardActionMenu";
import { UsageBarList } from "./UsageBarList";
import { DragGrip } from "./DragGrip";
import { AccountUsageRow } from "./UsageRows";

interface ProviderCardProps {
    provider: UsageProvider;
    group?: ProviderUsageGroup | undefined;
    connectorError?: ProviderError | undefined;
    onRefresh?: ((provider: UsageProvider) => void) | undefined;
    expanded?: boolean | undefined;
    onToggleExpand?: ((provider: UsageProvider) => void) | undefined;
    onToggleDisable?: ((provider: UsageProvider) => void) | undefined;
    dragging?: boolean | undefined;
    dragOver?: boolean | undefined;
    onDragStart?: ((provider: UsageProvider) => void) | undefined;
    onDragEnter?: ((provider: UsageProvider) => void) | undefined;
    onDragOver?: ((provider: UsageProvider, clientY: number, rect: DOMRect) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
    refreshing?: boolean | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
    onEditAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    onReLogin?: ((provider: UsageProvider) => void) | undefined;
}

type CardStatus = "loading" | "ready" | "failed" | "empty";

function is_auth_error(error: string): boolean {
    const lower = error.toLowerCase();
    return (
        lower.includes("token") ||
        lower.includes("credential") ||
        lower.includes("unauthorized") ||
        lower.includes("auth") ||
        lower.includes("凭证") ||
        lower.includes("登录") ||
        lower.includes("密钥")
    );
}

export const ProviderCard = memo(function ProviderCard({
    provider,
    group,
    connectorError,
    onRefresh,
    expanded,
    onToggleExpand,
    onToggleDisable,
    dragging,
    dragOver,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragEnd,
    refreshing: is_refreshing = false,
    barColorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
    onEditAccount,
    onReLogin,
}: ProviderCardProps) {
    const accountCount = group?.accountCount ?? 0;
    const hasUsage = (group?.periods.length ?? 0) > 0;
    const label = connectorError?.displayName ?? group?.label ?? PROVIDER_LABELS[provider];
    const isFailed = connectorError !== undefined && !hasUsage;
    const is_auth = connectorError !== undefined && is_auth_error(connectorError.error);
    const hasAccounts = group !== undefined && group.accounts.length > 0;
    const card_status: CardStatus = isFailed
        ? "failed"
        : is_refreshing && !hasUsage
          ? "loading"
          : hasUsage
            ? "ready"
            : "empty";
    const card_class =
        (dragging ? " dragging" : "") +
        (dragOver ? " drag-over" : "") +
        (group?.stale ? " stale" : "");

    const [l2open, set_l2open] = useState(false);

    const is_multi = accountCount > 1;
    const overview_periods = useMemo(() => (group ? build_overview_for_group(group) : []), [group]);
    const overview_updated_at = useMemo(
        () =>
            is_multi
                ? resolve_convergent_time(overview_periods.map((period) => period.updatedAt))
                : (group?.updatedAt ?? null),
        [group?.updatedAt, is_multi, overview_periods],
    );

    const updated_text = overview_updated_at ? relative_time(overview_updated_at) : "";

    // Provider-level menu items
    const menu_items: CardActionMenuItem[] = [
        {
            key: "edit",
            label: "编辑",
            icon: "edit",
            onSelect: () => {
                const first_account = group?.accounts[0];
                if (onEditAccount && first_account) {
                    onEditAccount(first_account);
                } else {
                    window.usageboard.settings.open({ provider });
                }
            },
        },
    ];
    if (onToggleDisable) {
        menu_items.push({
            key: "disable",
            label: "关闭",
            icon: "power",
            onSelect: () => {
                onToggleDisable(provider);
            },
        });
    }
    const render_state = () => {
        if (isFailed) {
            if (is_auth) {
                const auth_method = VENDOR_AUTH_MAP[provider];
                const auth_label =
                    auth_method === "session" ? "登录失效，请重新登录" : "凭证失效，请重新登录";
                return (
                    <div className="card-state auth">
                        <span className="cs-ic">
                            <Icon name="lock" size={15} />
                        </span>
                        <span>{auth_label}</span>
                        <span
                            className="cs-action"
                            onClick={() => {
                                if (onReLogin) {
                                    onReLogin(provider);
                                } else {
                                    window.usageboard.settings.open({ provider });
                                }
                            }}
                        >
                            重新登录
                        </span>
                    </div>
                );
            }
            return (
                <div className="card-state err">
                    <span className="cs-ic">
                        <Icon name="cloud_off" size={15} />
                    </span>
                    <span>{connectorError.error}</span>
                    {onRefresh && (
                        <span
                            className="cs-action"
                            onClick={(e) => {
                                e.stopPropagation();
                                onRefresh(provider);
                            }}
                        >
                            重试
                        </span>
                    )}
                </div>
            );
        }
        if (!hasUsage) {
            return <div className="card-state off">暂无账号。请到设置添加数据来源。</div>;
        }
        return null;
    };

    const header = (
        <>
            {onDragStart && <DragGrip iconSize={18} />}
            <VendorMark id={provider} size={26} />
            <span className="card-name">{label}</span>
            {accountCount > 1 && expanded === false && (
                <span className="count-badge">{String(accountCount)}账号</span>
            )}
            {accountCount > 1 && expanded !== false && (
                <span className="l2seg" role="tablist">
                    <button
                        className={l2open ? "" : "on"}
                        title="概览"
                        type="button"
                        onClick={() => {
                            if (l2open) set_l2open(false);
                        }}
                    >
                        概览
                    </button>
                    <button
                        className={l2open ? "on" : ""}
                        title="账号明细"
                        type="button"
                        onClick={() => {
                            if (!l2open) set_l2open(true);
                        }}
                    >
                        {String(accountCount)}账号
                    </button>
                </span>
            )}
            {is_refreshing && <span className="rel-time">刷新中…</span>}
            {!is_refreshing && hasUsage && <span className="rel-time">{updated_text}</span>}
            {!is_refreshing && hasUsage && group && group.stale && (
                <span className="freshness-meta">
                    <span className="stale-badge">已过期</span>
                </span>
            )}
        </>
    );

    const tools = (
        <>
            {onRefresh !== undefined && (
                <button
                    className={"icon-btn" + (is_refreshing ? " spinning" : "")}
                    title={`刷新 ${label}`}
                    aria-label={`刷新 ${label}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        onRefresh(provider);
                    }}
                >
                    <Icon name="refresh" size={16} />
                </button>
            )}
            <CardActionMenu ariaLabel="更多操作" title="更多操作" items={menu_items} />
        </>
    );

    const render_overview = () => {
        if (is_refreshing && !overview_periods.length) {
            return (
                <div className="skeleton-bars">
                    <div className="skel-row">
                        <div className="skel lbl" />
                        <div className="skel" />
                    </div>
                    <div className="skel-row">
                        <div className="skel lbl" />
                        <div className="skel" />
                    </div>
                </div>
            );
        }
        if (!overview_periods.length) return <div className="card-state off">暂无有效用量数据</div>;
        return (
            <UsageBarList
                periods={overview_periods}
                colorScheme={barColorScheme}
                barStyle={barStyle}
                labelMap={labelMap}
            />
        );
    };

    const render_account_detail = () => {
        if (!group) return null;
        return (
            <div className="acct-detail">
                {group.accounts.map((account) => (
                    <AccountUsageRow
                        key={account.id}
                        account={account}
                        barColorScheme={barColorScheme}
                        barStyle={barStyle}
                        labelMap={labelMap}
                    />
                ))}
            </div>
        );
    };

    const drag_root_props = onDragStart
        ? {
              draggable: true as const,
              onDragStart: () => {
                  onDragStart(provider);
              },
              onDragEnter: onDragEnter
                  ? () => {
                        onDragEnter(provider);
                    }
                  : undefined,
              onDragOver: (e: React.DragEvent<HTMLDivElement>) => {
                  e.preventDefault();
                  if (onDragOver) {
                      onDragOver(provider, e.clientY, e.currentTarget.getBoundingClientRect());
                  }
              },
              onDragEnd: onDragEnd,
          }
        : undefined;

    // Collapsible content: state message OR bar content
    const collapse_children =
        isFailed || !hasUsage
            ? render_state()
            : is_multi && l2open
              ? render_account_detail()
              : is_multi && !l2open
                ? render_overview()
                : group
                  ? group.accounts.map((account) => (
                        <UsageBarList
                            key={account.id}
                            periods={account.periods}
                            colorScheme={barColorScheme}
                            barStyle={barStyle}
                            labelMap={labelMap}
                        />
                    ))
                  : null;

    const can_collapse = onToggleExpand !== undefined && (hasAccounts || isFailed);

    // Unified: always use CollapsibleCard, even for non-collapsible (failed/no-data)
    return (
        <CollapsibleCard
            header={header}
            tools={tools}
            collapsed={can_collapse ? !expanded : false}
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

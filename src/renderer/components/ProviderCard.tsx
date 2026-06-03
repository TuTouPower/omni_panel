import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { ProviderUsageGroup } from "../lib/provider-usage";
import {
    PROVIDER_LABELS,
    buildOverviewForGroup,
    resolveConvergentTime,
} from "../lib/provider-usage";
import { relativeTime, formatResetTime } from "../lib/utils";
import type { ProviderError } from "./ProviderOverview";
import { Icon, VendorMark } from "./Icon";
import { CollapsibleCard } from "./CollapsibleCard";
import { ProviderAccountRow } from "./ProviderAccountRow";

interface ProviderCardProps {
    provider: UsageProvider;
    group?: ProviderUsageGroup | undefined;
    connectorError?: ProviderError | undefined;
    onRefresh?: ((provider: UsageProvider) => void) | undefined;
    expanded?: boolean | undefined;
    onToggleExpand?: ((provider: UsageProvider) => void) | undefined;
    disabled?: boolean | undefined;
    onToggleDisable?: ((provider: UsageProvider) => void) | undefined;
    onDelete?: ((provider: UsageProvider) => void) | undefined;
    dragging?: boolean | undefined;
    dragOver?: boolean | undefined;
    onDragStart?: ((provider: UsageProvider) => void) | undefined;
    onDragEnter?: ((provider: UsageProvider) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
}

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

export function ProviderCard({
    provider,
    group,
    connectorError,
    onRefresh,
    expanded,
    onToggleExpand,
    disabled = false,
    onToggleDisable,
    onDelete,
    dragging,
    dragOver,
    onDragStart,
    onDragEnter,
    onDragEnd,
}: ProviderCardProps) {
    const accountCount = group?.accountCount ?? 0;
    const hasUsage = (group?.windows.length ?? 0) > 0;
    const label = connectorError?.displayName ?? group?.label ?? PROVIDER_LABELS[provider];
    const isFailed = connectorError !== undefined && !hasUsage;
    const is_auth = connectorError !== undefined && is_auth_error(connectorError.error);
    const hasAccounts = group !== undefined && group.accounts.length > 0;
    const is_danger = group?.status === "critical";
    const card_class =
        (is_danger || isFailed ? "alert" : "") +
        (disabled ? " disabled" : "") +
        (dragging ? " dragging" : "") +
        (dragOver ? " drag-over" : "");

    const grip_handle = onDragStart ? (
        <button
            className="icon-btn card-grip"
            title="拖动以调整顺序"
            type="button"
            onMouseDown={() => {
                onDragStart(provider);
            }}
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            <Icon name="grip" size={18} strokeWidth={2} />
        </button>
    ) : null;

    const render_state = () => {
        if (disabled) {
            return (
                <div className="card-state off">
                    <span className="cs-ic">
                        <Icon name="power" size={16} />
                    </span>
                    <span>监控已关闭，不再刷新用量</span>
                    {onToggleDisable && (
                        <span
                            className="cs-action"
                            onClick={() => {
                                onToggleDisable(provider);
                            }}
                        >
                            启用
                        </span>
                    )}
                </div>
            );
        }
        if (isFailed) {
            if (is_auth) {
                return (
                    <div className="card-state auth">
                        <span className="cs-ic">
                            <Icon name="lock" size={15} />
                        </span>
                        <span>凭证失效，请重新登录</span>
                        <span
                            className="cs-action"
                            onClick={() => {
                                window.usageboard.settings.open();
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

    const [menu_open, set_menu_open] = useState(false);
    const [l2open, set_l2open] = useState(false);
    const menu_wrap_ref = useRef<HTMLDivElement>(null);
    const menu_ref = useRef<HTMLDivElement>(null);

    const toggle_menu = (e: React.MouseEvent) => {
        e.stopPropagation();
        set_menu_open((v) => !v);
    };

    const close_menu = useCallback(() => {
        set_menu_open(false);
    }, []);

    useEffect(() => {
        if (!menu_open) return;
        const on_click_outside = (e: MouseEvent) => {
            if (menu_ref.current && !menu_ref.current.contains(e.target as Node)) {
                close_menu();
            }
        };
        const on_escape = (e: KeyboardEvent) => {
            if (e.key === "Escape") close_menu();
        };
        document.addEventListener("mousedown", on_click_outside);
        document.addEventListener("keydown", on_escape);
        return () => {
            document.removeEventListener("mousedown", on_click_outside);
            document.removeEventListener("keydown", on_escape);
        };
    }, [menu_open, close_menu]);

    const is_multi = accountCount > 1;
    const overview_windows = useMemo(() => (group ? buildOverviewForGroup(group) : []), [group]);
    const overview_updated_at = useMemo(
        () =>
            is_multi
                ? resolveConvergentTime(overview_windows.map((window) => window.updatedAt))
                : (group?.updatedAt ?? null),
        [group?.updatedAt, is_multi, overview_windows],
    );

    const updated_text = overview_updated_at ? relativeTime(overview_updated_at) : "";

    const header = (
        <>
            {grip_handle}
            <VendorMark id={provider} size={26} />
            <span className="card-name">{label}</span>
            {accountCount > 1 && (expanded === false || disabled) && (
                <span className="count-badge">{String(accountCount)}账号</span>
            )}
            {accountCount > 1 && expanded !== false && !disabled && (
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
            {disabled && <span className="off-badge">已关闭</span>}
            {!disabled && hasUsage && <span className="rel-time">{updated_text}</span>}
        </>
    );

    const tools = (
        <>
            {onRefresh !== undefined && !disabled && (
                <button
                    className="icon-btn"
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
            <div className="card-menu-wrap" ref={menu_wrap_ref}>
                <button
                    className="icon-btn"
                    aria-label="更多操作"
                    title="更多操作"
                    onClick={toggle_menu}
                >
                    <Icon name="more" size={16} />
                </button>
                {menu_open && (
                    <>
                        <div className="card-menu-overlay" onClick={close_menu} />
                        <div
                            className="card-menu"
                            ref={menu_ref}
                            onClick={(e) => {
                                e.stopPropagation();
                            }}
                        >
                            <div
                                className="cm-item"
                                onClick={() => {
                                    window.usageboard.settings.open();
                                    close_menu();
                                }}
                            >
                                <span className="cm-ic">
                                    <Icon name="edit" size={15} />
                                </span>
                                编辑
                            </div>
                            {onToggleDisable && (
                                <div
                                    className="cm-item"
                                    onClick={() => {
                                        onToggleDisable(provider);
                                        close_menu();
                                    }}
                                >
                                    <span className="cm-ic">
                                        <Icon name="power" size={15} />
                                    </span>
                                    {disabled ? "启用" : "关闭"}
                                </div>
                            )}
                            {onDelete && (
                                <div
                                    className="cm-item danger"
                                    onClick={() => {
                                        onDelete(provider);
                                        close_menu();
                                    }}
                                >
                                    <span className="cm-ic">
                                        <Icon name="trash" size={15} />
                                    </span>
                                    删除
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </>
    );

    const render_overview = () => {
        if (!overview_windows.length) return <div className="card-state off">暂无有效用量数据</div>;
        return (
            <div className="ub-rows">
                {overview_windows.map((ow) => {
                    const displayPercent = Math.min(100, Math.max(0, ow.percent));
                    const resetAtText = ow.resetAt ? formatResetTime(ow.resetAt) : null;
                    const danger = ow.status === "critical";
                    return (
                        <div className="ub-row" key={ow.id}>
                            <div className="ub-row-label">{ow.name}</div>
                            <div
                                className="ub-bar"
                                data-tone={
                                    danger ? "danger" : ow.status === "warning" ? "warn" : undefined
                                }
                                data-invert={displayPercent >= 52 ? "true" : undefined}
                            >
                                <div
                                    className="ub-bar-fill"
                                    style={{ width: `${String(displayPercent)}%` }}
                                />
                                <div className="ub-bar-text">
                                    {ow.displayStyle === "percent"
                                        ? `${String(displayPercent)}%`
                                        : `${ow.used.toLocaleString()} / ${ow.limit.toLocaleString()}`}
                                </div>
                            </div>
                            <div className="ub-row-time">
                                {danger ? "⚠" : (resetAtText ?? "--")}
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const render_account_detail = () => {
        if (!group) return null;
        return (
            <div className="acct-detail">
                {group.accounts.map((account) => (
                    <div className="acct-item" key={account.id}>
                        <div className="ai-head">
                            <span className="ai-dot" />
                            <span className="ai-name">{account.accountLabel}</span>
                            <span className="ai-key">{account.accountId}</span>
                            <span className="ai-time">
                                {account.updatedAt ? relativeTime(account.updatedAt) : ""}
                            </span>
                        </div>
                        <div className="ai-bars">
                            {account.windows.map((window) => {
                                const windowPercent =
                                    window.limit > 0
                                        ? Math.min(
                                              100,
                                              Math.round((window.used / window.limit) * 100),
                                          )
                                        : 0;
                                const windowDanger = windowPercent >= 85;
                                return (
                                    <div className="ub-row" key={window.id}>
                                        <div className="ub-row-label">{window.name}</div>
                                        <div
                                            className="ub-bar"
                                            data-tone={
                                                window.status === "critical"
                                                    ? "danger"
                                                    : window.status === "warning"
                                                      ? "warn"
                                                      : undefined
                                            }
                                            data-invert={windowPercent >= 52 ? "true" : undefined}
                                        >
                                            <div
                                                className="ub-bar-fill"
                                                style={{ width: `${String(windowPercent)}%` }}
                                            />
                                            <div className="ub-bar-text">
                                                {window.displayStyle === "percent"
                                                    ? `${String(windowPercent)}%`
                                                    : `${window.used.toLocaleString()} / ${window.limit.toLocaleString()}`}
                                            </div>
                                        </div>
                                        <div className="ub-row-time">
                                            {windowDanger
                                                ? "⚠"
                                                : window.resetAt
                                                  ? formatResetTime(window.resetAt)
                                                  : "--"}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const drag_events = onDragStart
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
              onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
              },
              onDragEnd: onDragEnd,
          }
        : {};

    const card_content =
        onToggleExpand === undefined || !hasAccounts ? (
            <div
                data-provider={provider}
                className={"card" + (card_class ? ` ${card_class}` : "")}
                {...drag_events}
            >
                <div className="card-head">
                    {header}
                    <div className="card-tools">{tools}</div>
                </div>
                {render_state()}
            </div>
        ) : (
            <CollapsibleCard
                header={header}
                tools={tools}
                collapsed={!expanded}
                onToggle={() => {
                    onToggleExpand(provider);
                }}
                className={card_class || undefined}
            >
                {is_multi && l2open
                    ? render_account_detail()
                    : is_multi && !l2open
                      ? render_overview()
                      : group.accounts.map((account) => (
                            <ProviderAccountRow key={account.id} account={account} />
                        ))}
            </CollapsibleCard>
        );

    return card_content;
}

import { useState, useRef, useEffect, useCallback } from "react";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { ProviderUsageAccount } from "../lib/provider-usage";
import { relative_time } from "../lib/utils";
import { DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";
import { CollapsibleCard } from "./CollapsibleCard";
import { Icon } from "./Icon";
import { UsageBarRow } from "./UsageRows";

interface ProviderAccountRowProps {
    account: ProviderUsageAccount;
    collapsed?: boolean | undefined;
    onToggleCollapsed?: (() => void) | undefined;
    dragging?: boolean | undefined;
    dragOver?: boolean | undefined;
    onDragStart?: (() => void) | undefined;
    onDragEnter?: (() => void) | undefined;
    onDragEnd?: (() => void) | undefined;
    onEditAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    onDisableAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    onHideOrDeleteAccount?: ((account: ProviderUsageAccount) => void) | undefined;
    isCpaSource?: boolean | undefined;
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
}

export function ProviderAccountRow({
    account,
    collapsed,
    onToggleCollapsed,
    dragging,
    dragOver,
    onDragStart,
    onDragEnter,
    onDragEnd,
    onEditAccount,
    onDisableAccount,
    onHideOrDeleteAccount,
    isCpaSource = false,
    barColorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
}: ProviderAccountRowProps) {
    const source = account.periods[0]?.source ?? "direct";
    const [menu_open, set_menu_open] = useState(false);
    const menu_ref = useRef<HTMLDivElement>(null);

    const close_menu = useCallback(() => {
        set_menu_open(false);
    }, []);

    useEffect(() => {
        if (!menu_open) return;
        const on_click = (e: MouseEvent) => {
            if (menu_ref.current && !menu_ref.current.contains(e.target as Node)) {
                close_menu();
            }
        };
        const on_key = (e: KeyboardEvent) => {
            if (e.key === "Escape") close_menu();
        };
        document.addEventListener("mousedown", on_click);
        document.addEventListener("keydown", on_key);
        return () => {
            document.removeEventListener("mousedown", on_click);
            document.removeEventListener("keydown", on_key);
        };
    }, [menu_open, close_menu]);

    const has_menu =
        onEditAccount !== undefined ||
        onDisableAccount !== undefined ||
        onHideOrDeleteAccount !== undefined;

    const grip = onDragStart ? (
        <button
            className="icon-btn card-grip"
            title="拖动以调整顺序"
            type="button"
            onMouseDown={onDragStart}
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            <Icon name="grip" size={16} strokeWidth={2} />
        </button>
    ) : null;

    const header = (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {grip}
            <div>
                <div className="card-name">
                    {account.accountLabel}
                    <span className="source-badge">{source.toUpperCase()}</span>
                </div>
                <div className="rel-time">
                    {account.updatedAt ? relative_time(account.updatedAt) : ""}
                </div>
            </div>
            {has_menu && (
                <div className="card-menu-wrap" style={{ marginLeft: "auto" }}>
                    <button
                        className="icon-btn"
                        aria-label="账号操作"
                        title="账号操作"
                        onClick={(e) => {
                            e.stopPropagation();
                            set_menu_open((v) => !v);
                        }}
                    >
                        <Icon name="more" size={14} />
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
                                {onEditAccount && (
                                    <div
                                        className="cm-item"
                                        onClick={() => {
                                            onEditAccount(account);
                                            close_menu();
                                        }}
                                    >
                                        <span className="cm-ic">
                                            <Icon name="edit" size={14} />
                                        </span>
                                        编辑
                                    </div>
                                )}
                                {onDisableAccount && (
                                    <div
                                        className="cm-item"
                                        onClick={() => {
                                            onDisableAccount(account);
                                            close_menu();
                                        }}
                                    >
                                        <span className="cm-ic">
                                            <Icon name="close" size={14} />
                                        </span>
                                        关闭监控
                                    </div>
                                )}
                                {onHideOrDeleteAccount && (
                                    <div
                                        className="cm-item danger"
                                        onClick={() => {
                                            onHideOrDeleteAccount(account);
                                            close_menu();
                                        }}
                                    >
                                        <span className="cm-ic">
                                            <Icon name="trash" size={14} />
                                        </span>
                                        {isCpaSource ? "隐藏" : "删除"}
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            )}
        </div>
    );
    const details = (
        <div className="bars">
            {account.periods.map((period, idx) => (
                <UsageBarRow
                    key={period.id}
                    period={period}
                    index={idx}
                    colorScheme={barColorScheme}
                    barStyle={barStyle}
                    labelMap={labelMap}
                />
            ))}
        </div>
    );

    const card_class =
        (account.status === "critical" ? " alert" : "") +
        (dragging ? " dragging" : "") +
        (dragOver ? " drag-over" : "");
    const drag_events = onDragStart
        ? {
              draggable: true as const,
              onDragStart,
              onDragEnter,
              onDragOver: (e: React.DragEvent) => {
                  e.preventDefault();
              },
              onDragEnd,
          }
        : {};

    if (collapsed === undefined || onToggleCollapsed === undefined) {
        return (
            <div className={"card" + card_class} {...drag_events}>
                <div className="card-head">{header}</div>
                {details}
            </div>
        );
    }

    return (
        <CollapsibleCard
            header={header}
            collapsed={collapsed}
            onToggle={onToggleCollapsed}
            toggleLabel={
                collapsed ? `展开 ${account.accountLabel}` : `折叠 ${account.accountLabel}`
            }
            className={card_class || undefined}
            {...drag_events}
        >
            {details}
        </CollapsibleCard>
    );
}

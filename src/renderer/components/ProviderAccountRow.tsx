import { useMemo } from "react";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { ProviderUsageAccount } from "../lib/provider-usage";
import { relative_time } from "../lib/utils";
import { DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";
import { CollapsibleCard } from "./CollapsibleCard";
import { CardActionMenu } from "./CardActionMenu";
import type { CardActionMenuItem } from "./CardActionMenu";
import { UsageBarList } from "./UsageBarList";
import { DragGrip } from "./DragGrip";

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
    barColorScheme?: UsageBarColorScheme | undefined;
    barStyle?: UsageBarStyle | undefined;
    labelMap?: Readonly<Record<string, string>> | undefined;
}

export function ProviderAccountRow({
    account,
    collapsed = false,
    onToggleCollapsed,
    dragging,
    dragOver,
    onDragStart,
    onDragEnter,
    onDragEnd,
    onEditAccount,
    onDisableAccount,
    barColorScheme = DEFAULT_USAGE_BAR_COLOR_SCHEME,
    barStyle = "thin",
    labelMap,
}: ProviderAccountRowProps) {
    const source = account.periods[0]?.source ?? "direct";

    const menu_items: CardActionMenuItem[] = useMemo(() => {
        const items: CardActionMenuItem[] = [];
        if (onEditAccount) {
            items.push({
                key: "edit",
                label: "编辑",
                icon: "edit",
                iconSize: 14,
                onSelect: () => {
                    onEditAccount(account);
                },
            });
        }
        if (onDisableAccount) {
            items.push({
                key: "disable",
                label: "关闭监控",
                icon: "close",
                iconSize: 14,
                onSelect: () => {
                    onDisableAccount(account);
                },
            });
        }
        return items;
    }, [account, onEditAccount, onDisableAccount]);

    const header = (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {onDragStart && <DragGrip onMouseDown={onDragStart} />}
            <div>
                <div className="card-name">
                    {account.accountLabel}
                    <span className="source-badge">{source.toUpperCase()}</span>
                </div>
                <div className="rel-time">
                    {account.updatedAt ? relative_time(account.updatedAt) : ""}
                </div>
            </div>
            {menu_items.length > 0 && (
                <div style={{ marginLeft: "auto" }}>
                    <CardActionMenu
                        ariaLabel="账号操作"
                        title="账号操作"
                        triggerIconSize={14}
                        items={menu_items}
                    />
                </div>
            )}
        </div>
    );

    const card_class =
        (account.status === "critical" ? " alert" : "") +
        (dragging ? " dragging" : "") +
        (dragOver ? " drag-over" : "");

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
                collapsed ? `展开 ${account.accountLabel}` : `折叠 ${account.accountLabel}`
            }
            className={card_class || undefined}
            rootProps={drag_root_props}
        >
            <UsageBarList
                periods={account.periods}
                colorScheme={barColorScheme}
                barStyle={barStyle}
                labelMap={labelMap}
            />
        </CollapsibleCard>
    );
}

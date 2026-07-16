import { memo } from "react";
import type { UsageBarColorScheme, UsageBarStyle } from "../../shared/types/config";
import type { ProviderUsageAccount } from "../lib/provider-usage";
import { relative_time } from "../lib/utils";
import { DEFAULT_USAGE_BAR_COLOR_SCHEME } from "../lib/usage-colors";
import { CollapsibleCard } from "./CollapsibleCard";
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
        </CollapsibleCard>
    );
});

import type { ProviderUsageAccount } from "../lib/provider-usage";
import { formatResetTime } from "../lib/utils";
import { CollapsibleCard } from "./CollapsibleCard";
import { Icon } from "./Icon";

interface ProviderAccountRowProps {
    account: ProviderUsageAccount;
    collapsed?: boolean | undefined;
    onToggleCollapsed?: (() => void) | undefined;
    dragging?: boolean | undefined;
    dragOver?: boolean | undefined;
    onDragStart?: (() => void) | undefined;
    onDragEnter?: (() => void) | undefined;
    onDragEnd?: (() => void) | undefined;
}

function percent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

function is_5hour_period(name: string): boolean {
    return name.includes("5小时");
}

function period_label(name: string): string {
    if (is_5hour_period(name)) return "5小时";
    if (name.includes("一周")) return "一周";
    return name;
}

function period_fill_class(name: string): string {
    return is_5hour_period(name) ? "blue" : "purple";
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
}: ProviderAccountRowProps) {
    const source = account.periods[0]?.source ?? "direct";
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
                <div className="rel-time">{account.periods.length}个周期</div>
            </div>
        </div>
    );
    const details = (
        <div className="bars">
            {account.periods.map((period) => {
                const period_percent = percent(period.used, period.limit);
                const danger = period.status === "critical";
                return (
                    <div className="bar-row" key={period.id}>
                        <span className="bar-lbl">{period_label(period.name)}</span>
                        <div className="track">
                            <div
                                className={
                                    "fill " + (danger ? "danger" : period_fill_class(period.name))
                                }
                                style={{ width: `${String(period_percent)}%` }}
                            />
                        </div>
                        <span className={"bar-pct" + (danger ? " danger" : "")}>
                            {period_percent}%
                        </span>
                        <span className="bar-reset">
                            {period.resetAt ? formatResetTime(period.resetAt) : "--"}
                        </span>
                    </div>
                );
            })}
        </div>
    );

    const card_class = (dragging ? " dragging" : "") + (dragOver ? " drag-over" : "");
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

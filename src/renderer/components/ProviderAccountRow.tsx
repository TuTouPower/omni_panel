import type { ProviderUsageAccount } from "../lib/provider-usage";
import { format_usage_period_label } from "../lib/provider-usage";
import { format_reset_time } from "../lib/utils";
import { usage_color } from "../lib/usage-colors";
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
            {account.periods.map((period, idx) => {
                if (period.used == null) {
                    return (
                        <div className="bar-row" key={period.id}>
                            <span className="bar-lbl">
                                {format_usage_period_label(period.name)}
                            </span>
                            <div className="track">
                                <div
                                    className="fill"
                                    style={{
                                        width: "0%",
                                        background: usage_color(idx),
                                    }}
                                />
                            </div>
                            <span className="bar-pct" />
                            <span className="bar-reset" />
                        </div>
                    );
                }
                if (period.displayStyle === "ratio" && period.limit > 0) {
                    const fill_pct = Math.min(
                        100,
                        Math.max(0, Math.round((period.used / period.limit) * 100)),
                    );
                    return (
                        <div className="bar-row frac" key={period.id}>
                            <span className="bar-lbl">
                                {format_usage_period_label(period.name)}
                            </span>
                            <div className="track">
                                <div
                                    className="fill"
                                    style={{
                                        width: `${String(fill_pct)}%`,
                                        background: usage_color(idx),
                                    }}
                                />
                            </div>
                            <span className="bar-pct">
                                {period.used}/{period.limit}
                            </span>
                            <span className="bar-reset" />
                        </div>
                    );
                }
                const period_percent = percent(period.used, period.limit);
                return (
                    <div className="bar-row" key={period.id}>
                        <span className="bar-lbl">{format_usage_period_label(period.name)}</span>
                        <div className="track">
                            <div
                                className="fill"
                                style={{
                                    width: `${String(period_percent)}%`,
                                    background: usage_color(idx),
                                }}
                            />
                        </div>
                        <span className="bar-pct">{period_percent}%</span>
                        <span className="bar-reset">
                            {period.resetAt ? format_reset_time(period.resetAt) : "--"}
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

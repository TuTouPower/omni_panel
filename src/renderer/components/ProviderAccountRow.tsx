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

function usageText(used: number, limit: number): string {
    if (limit <= 0) return `${used.toLocaleString()} / -`;
    return `${used.toLocaleString()} / ${limit.toLocaleString()}`;
}

function percent(used: number, limit: number): number {
    if (limit <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((used / limit) * 100)));
}

function tone(status: string): string {
    if (status === "critical") return "danger";
    if (status === "warning") return "warn";
    return "normal";
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
    const source = account.windows[0]?.source ?? "direct";
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
                <div className="rel-time">{account.windows.length} 个窗口</div>
            </div>
        </div>
    );
    const details = (
        <div className="ub-rows">
            {account.windows.map((window) => {
                const windowPercent = percent(window.used, window.limit);
                return (
                    <div className="ub-row" key={window.id}>
                        <div className="ub-row-label">{window.name}</div>
                        <div
                            className="ub-bar"
                            data-tone={tone(window.status)}
                            data-invert={windowPercent >= 52 ? "true" : "false"}
                        >
                            <div
                                className="ub-bar-fill"
                                style={{ width: `${String(windowPercent)}%` }}
                            />
                            <div className="ub-bar-text">
                                {window.displayStyle === "percent"
                                    ? `${String(windowPercent)}%`
                                    : usageText(window.used, window.limit)}
                            </div>
                        </div>
                        <div className="ub-row-time">
                            {window.resetAt ? formatResetTime(window.resetAt) : "--"}
                        </div>
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

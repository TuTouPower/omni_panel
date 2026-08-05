import type { UpcomingResetItem } from "../lib/provider-usage";
import { CollapsibleCard } from "./CollapsibleCard";
import { DragGrip } from "./DragGrip";
import { UpcomingResetRow } from "./UpcomingResetRow";

export const UPCOMING_RESET_CARD_ID = "__upcoming_reset__";

export interface UpcomingResetCardProps {
    items: UpcomingResetItem[];
    onSelectProvider: (provider: string) => void;
    desensitizeRemarks?: boolean | undefined;
    expanded?: boolean | undefined;
    onToggleExpand?: (() => void) | undefined;
    dragging?: boolean | undefined;
    dragOver?: boolean | undefined;
    onDragStart?: ((rect?: DOMRect) => void) | undefined;
    onDragEnter?: (() => void) | undefined;
    onDragOver?: ((clientX: number, clientY: number, rect: DOMRect) => void) | undefined;
    onDragEnd?: (() => void) | undefined;
}

export function UpcomingResetCard({
    items,
    onSelectProvider,
    desensitizeRemarks = false,
    expanded = false,
    onToggleExpand,
    dragging = false,
    dragOver = false,
    onDragStart,
    onDragEnter,
    onDragOver,
    onDragEnd,
}: UpcomingResetCardProps) {
    const card_class =
        "upcoming-card" + (dragging ? " dragging" : "") + (dragOver ? " drag-over" : "");
    const header = (
        <>
            {onDragStart && <DragGrip iconSize={18} />}
            <span className="card-name">即将重置</span>
            <span className="count-badge">{items.length} 项</span>
        </>
    );
    const drag_root_props = onDragStart
        ? {
              draggable: true as const,
              onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
                  onDragStart(event.currentTarget.getBoundingClientRect());
              },
              onDragEnter: onDragEnter
                  ? () => {
                        onDragEnter();
                    }
                  : undefined,
              onDragOver: (event: React.DragEvent<HTMLDivElement>) => {
                  event.preventDefault();
                  onDragOver?.(
                      event.clientX,
                      event.clientY,
                      event.currentTarget.getBoundingClientRect(),
                  );
              },
              onDragEnd,
              "data-card-id": UPCOMING_RESET_CARD_ID,
              "aria-label": "即将重置",
          }
        : {
              "data-card-id": UPCOMING_RESET_CARD_ID,
              "aria-label": "即将重置",
          };

    return (
        <CollapsibleCard
            header={header}
            collapsed={onToggleExpand !== undefined ? !expanded : false}
            collapsible={onToggleExpand !== undefined}
            onToggle={onToggleExpand ?? (() => undefined)}
            toggleLabel={expanded ? "折叠即将重置" : "展开即将重置"}
            className={card_class}
            rootProps={drag_root_props}
        >
            {items.length === 0 ? (
                <div className="ur-empty">未来 7 天内暂无重置</div>
            ) : (
                <div className="ur-list">
                    {items.map((item) => {
                        const key = `${item.accountId}:${item.metricLabel}:${String(item.resetAt)}`;
                        return (
                            <UpcomingResetRow
                                key={key}
                                item={item}
                                onSelectProvider={onSelectProvider}
                                desensitizeRemarks={desensitizeRemarks}
                            />
                        );
                    })}
                </div>
            )}
        </CollapsibleCard>
    );
}

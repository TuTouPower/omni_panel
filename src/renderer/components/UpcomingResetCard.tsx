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
    onDragStart?: ((rect?: DOMRect) => void) | undefined;
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
    onDragStart,
    onDragOver,
    onDragEnd,
}: UpcomingResetCardProps) {
    const card_class = dragging ? " opacity-45" : "";
    const header = (
        <>
            {onDragStart && <DragGrip iconSize={18} />}
            <span
                className="truncate text-[15.5px] font-[650] tracking-[-0.01em] text-[var(--color-on-surface)]"
                data-testid="card-name"
            >
                即将重置
            </span>
            <span className="shrink-0 rounded-[7px] bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] px-2 py-[1px] text-[length:var(--text-label-md)] font-semibold leading-normal text-[var(--color-accent)]">
                {items.length} 项
            </span>
        </>
    );
    const drag_root_props = onDragStart
        ? {
              draggable: true as const,
              onDragStart: (event: React.DragEvent<HTMLDivElement>) => {
                  onDragStart(event.currentTarget.getBoundingClientRect());
              },
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
                <div className="px-2 pb-2.5 pt-4 text-center text-[12.5px] text-[var(--color-on-surface-muted)]">
                    未来 7 天内暂无重置
                </div>
            ) : (
                <div className="flex flex-col gap-0.5 px-1 pb-1 pt-2">
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

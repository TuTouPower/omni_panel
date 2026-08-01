import type { UpcomingResetItem } from "../../lib/provider-usage";
import { UpcomingResetCard, UPCOMING_RESET_CARD_ID } from "../../components/UpcomingResetCard";

interface UpcomingResetCardSlotProps {
    is_live: boolean;
    force_collapse: boolean;
    upcomingItems: UpcomingResetItem[];
    desensitizeRemarks: boolean;
    expanded: boolean;
    drag_id: string | null;
    over_id: string | null;
    onSelectProvider: (provider: string) => void;
    onToggleExpand: () => void;
    onDragStart: (rect?: DOMRect) => void;
    onDragEnter: () => void;
    onDragOver: (clientX: number, clientY: number, rect: DOMRect) => void;
    onDragEnd: () => void;
}

export function UpcomingResetCardSlot(props: UpcomingResetCardSlotProps) {
    const {
        is_live,
        force_collapse,
        upcomingItems,
        desensitizeRemarks,
        expanded,
        drag_id,
        over_id,
        onSelectProvider,
        onToggleExpand,
        onDragStart,
        onDragEnter,
        onDragOver,
        onDragEnd,
    } = props;
    return (
        <UpcomingResetCard
            items={upcomingItems}
            onSelectProvider={is_live ? onSelectProvider : () => undefined}
            desensitizeRemarks={desensitizeRemarks}
            expanded={is_live && !force_collapse ? expanded : false}
            onToggleExpand={is_live ? onToggleExpand : undefined}
            dragging={is_live && drag_id === UPCOMING_RESET_CARD_ID}
            dragOver={
                is_live &&
                drag_id !== null &&
                drag_id !== UPCOMING_RESET_CARD_ID &&
                over_id === UPCOMING_RESET_CARD_ID
            }
            onDragStart={
                is_live
                    ? (rect) => {
                          onDragStart(rect);
                      }
                    : undefined
            }
            onDragEnter={
                is_live
                    ? () => {
                          onDragEnter();
                      }
                    : undefined
            }
            onDragOver={
                is_live
                    ? (clientX, clientY, rect) => {
                          onDragOver(clientX, clientY, rect);
                      }
                    : undefined
            }
            onDragEnd={is_live ? onDragEnd : undefined}
        />
    );
}

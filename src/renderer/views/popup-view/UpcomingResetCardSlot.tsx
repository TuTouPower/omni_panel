import type { UpcomingResetItem } from "../../lib/provider-usage";
import { UpcomingResetCard, UPCOMING_RESET_CARD_ID } from "../../components/UpcomingResetCard";

interface UpcomingResetCardSlotProps {
    is_live: boolean;
    force_collapse: boolean;
    upcomingItems: UpcomingResetItem[];
    desensitizeRemarks: boolean;
    expanded: boolean;
    drag_id: string | null;
    onSelectProvider: (provider: string) => void;
    onToggleExpand: () => void;
    onDragStart: (rect?: DOMRect) => void;
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
        onSelectProvider,
        onToggleExpand,
        onDragStart,
        onDragOver,
        onDragEnd,
    } = props;
    return (
        <UpcomingResetCard
            items={upcomingItems}
            onSelectProvider={is_live ? onSelectProvider : () => undefined}
            desensitizeRemarks={desensitizeRemarks}
            expanded={force_collapse ? false : expanded}
            onToggleExpand={onToggleExpand}
            dragging={is_live && drag_id === UPCOMING_RESET_CARD_ID}
            onDragStart={onDragStart}
            onDragOver={onDragOver}
            onDragEnd={onDragEnd}
        />
    );
}

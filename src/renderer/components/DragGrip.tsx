import { Icon } from "./Icon";

interface DragGripProps {
    onMouseDown: () => void;
    iconSize?: number | undefined;
}

export function DragGrip({ onMouseDown, iconSize = 16 }: DragGripProps) {
    return (
        <button
            className="icon-btn card-grip"
            title="拖动以调整顺序"
            type="button"
            onMouseDown={onMouseDown}
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            <Icon name="grip" size={iconSize} strokeWidth={2} />
        </button>
    );
}

import { Icon } from "./Icon";
import { Button } from "./ui/Button";

interface DragGripProps {
    iconSize?: number | undefined;
}

export function DragGrip({ iconSize = 16 }: DragGripProps) {
    return (
        <Button
            className="-ml-1 -mr-0.5 h-8 w-8 cursor-grab p-0 text-[var(--color-on-surface-muted)] active:cursor-grabbing"
            variant="icon"
            size="sm"
            title="拖动以调整顺序"
            data-testid="card-grip"
            type="button"
            onClick={(e) => {
                e.stopPropagation();
            }}
        >
            <Icon name="grip" size={iconSize} strokeWidth={2} />
        </Button>
    );
}

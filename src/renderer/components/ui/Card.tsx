import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
    /** card vs raised（对齐 DESIGN.md surface-card / surface-raised）。 */
    raised?: boolean;
}

/** t269/t423: 统一 Card（DESIGN.md card 形态：14px 圆角 + 发丝描边 + shadow-card + 16px 内边距）。 */
export function Card({ raised, className, ...props }: CardProps) {
    return (
        <div
            className={cn(
                "rounded-lg border border-[var(--color-outline)] bg-[var(--color-surface-card)] text-[var(--color-on-surface)] p-[var(--spacing-card-padding)] shadow-card",
                raised && "bg-[var(--color-surface-raised)]",
                className,
            )}
            {...props}
        />
    );
}

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface BadgeProps {
    children: ReactNode;
    /** count 计数 / label 来源标签。 */
    variant?: "count" | "label";
    /** label 形态的着色 key（DESIGN.md 分类色）。 */
    color?: string;
    className?: string;
}

/** t269: 统一 Badge——count 计数 / label 来源标签双形态。 */
export function Badge({ children, variant = "count", color, className }: BadgeProps) {
    if (variant === "count") {
        return (
            <span
                className={cn(
                    "inline-flex min-w-[18px] items-center justify-center rounded-full " +
                        "bg-[var(--color-primary-container)] px-1.5 py-px text-[length:var(--text-label-caps)] text-[var(--color-primary)]",
                    className,
                )}
            >
                {children}
            </span>
        );
    }
    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-md px-1.5 py-px text-[length:var(--text-label-md)]",
                className,
            )}
            style={
                color
                    ? { color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }
                    : undefined
            }
        >
            <span
                className="h-1.5 w-1.5 rounded-full"
                style={color ? { backgroundColor: color } : undefined}
            />
            {children}
        </span>
    );
}

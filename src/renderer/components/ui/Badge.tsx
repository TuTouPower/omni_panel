import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface BadgeProps {
    children: ReactNode;
    /**
     * count 计数 / label 来源标签 /
     * accent 卡片头计数（12% accent 浅底）/ recommend 推荐徽章。
     */
    variant?: "count" | "label" | "accent" | "recommend";
    /** label 形态的着色 key（DESIGN.md 分类色）。 */
    color?: string;
    /** label 形态前置圆点开关（默认开启；t320 会话明细表关闭）。 */
    dot?: boolean;
    className?: string;
}

/** t269: 统一 Badge；t422 增 accent/recommend 收拢手拼配方。 */
export function Badge({ children, variant = "count", color, dot = true, className }: BadgeProps) {
    if (variant === "count") {
        return (
            <span
                className={cn(
                    "inline-flex min-w-[18px] items-center justify-center rounded-full " +
                        "bg-[var(--color-primary-container)] px-2 py-px " +
                        "text-[length:var(--text-label-caps)] text-[var(--color-primary)]",
                    className,
                )}
            >
                {children}
            </span>
        );
    }
    if (variant === "accent") {
        return (
            <span
                className={cn(
                    "inline-flex shrink-0 items-center justify-center rounded-xs " +
                        "bg-[color-mix(in_srgb,var(--color-accent)_12%,transparent)] " +
                        "px-2 py-0 text-[length:var(--text-label-md)] font-semibold " +
                        "leading-normal text-[var(--color-accent)]",
                    className,
                )}
            >
                {children}
            </span>
        );
    }
    if (variant === "recommend") {
        return (
            <span
                className={cn(
                    "inline-flex items-center rounded bg-[var(--color-primary-container)] " +
                        "px-2 py-1 text-[length:var(--text-label-md)] text-[var(--color-accent)]",
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
                "inline-flex items-center gap-1 rounded-md px-2 py-px text-[length:var(--text-label-md)]",
                className,
            )}
            style={
                color
                    ? { color, backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }
                    : undefined
            }
        >
            {dot && (
                <span
                    className="h-1.5 w-1.5 rounded-full"
                    style={color ? { backgroundColor: color } : undefined}
                />
            )}
            {children}
        </span>
    );
}

import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

export type StatusTone = "success" | "warning" | "error" | "neutral" | "accent";

const tones: Record<StatusTone, string> = {
    success:
        "bg-[var(--color-success)] ring-[3px] ring-[color-mix(in_srgb,var(--color-success)_16%,transparent)]",
    warning:
        "bg-[var(--color-warning)] ring-[3px] ring-[color-mix(in_srgb,var(--color-warning)_16%,transparent)]",
    error: "bg-[var(--color-error)] ring-[3px] ring-[color-mix(in_srgb,var(--color-error)_16%,transparent)]",
    neutral:
        "bg-[var(--color-on-surface-muted)] ring-[3px] ring-[color-mix(in_srgb,var(--color-on-surface-muted)_16%,transparent)]",
    accent: "bg-[var(--color-accent)] ring-[3px] ring-[color-mix(in_srgb,var(--color-accent)_16%,transparent)]",
};

interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
    tone?: StatusTone;
}

/** t269/t423: 统一 StatusDot（DESIGN.md：7px 圆点 + 同色 16% 光晕）。 */
export function StatusDot({ tone = "neutral", className, ...props }: StatusDotProps) {
    return (
        <span
            className={cn(
                "inline-block h-[7px] w-[7px] shrink-0 rounded-full",
                tones[tone],
                className,
            )}
            {...props}
        />
    );
}

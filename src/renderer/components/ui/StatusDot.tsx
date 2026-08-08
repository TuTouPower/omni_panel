import { cn } from "../../lib/utils";

type StatusTone = "success" | "warning" | "error" | "neutral" | "accent";

const tones: Record<StatusTone, string> = {
    success: "bg-[var(--color-success)]",
    warning: "bg-[var(--color-warning)]",
    error: "bg-[var(--color-error)]",
    neutral: "bg-[var(--color-on-surface-muted)]",
    accent: "bg-[var(--color-accent)]",
};

interface StatusDotProps {
    tone?: StatusTone;
    className?: string;
}

/** t269: 统一 StatusDot（状态点）。 */
export function StatusDot({ tone = "neutral", className }: StatusDotProps) {
    return <span className={cn("inline-block h-2 w-2 rounded-full", tones[tone], className)} />;
}

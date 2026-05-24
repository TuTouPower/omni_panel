import { cn } from "../lib/utils";

export function Skeleton({ className }: { className?: string }) {
    return (
        <div className={cn("animate-pulse rounded-[var(--radius)] bg-[var(--muted)]", className)} />
    );
}

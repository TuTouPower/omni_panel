import { cn } from "../../lib/utils";

interface SkeletonProps {
    className?: string;
}

/** t269: 统一 Skeleton（骨架屏）。@utility shimmer 提供动画。 */
export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            className={cn(
                "shimmer animate-pulse rounded-md bg-[var(--color-surface-raised)]",
                className,
            )}
            aria-hidden="true"
        />
    );
}

import { Skeleton } from "../../components/ui/Skeleton";

export function SkeletonCard() {
    return (
        <div
            className="rounded-[var(--radius-lg)] border-[0.5px] border-[var(--color-outline)] bg-[var(--color-surface-card)] px-4 py-3.5 shadow-card dark:shadow-card-dark"
            data-testid="card-skeleton"
        >
            <div className="flex items-center gap-[9px]">
                <Skeleton className="h-4 w-24" />
            </div>
            <div className="mt-[11px] flex flex-col gap-[9px]">
                <div className="grid grid-cols-[42px_1fr] items-center gap-2.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
                <div className="grid grid-cols-[42px_1fr] items-center gap-2.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
            </div>
        </div>
    );
}

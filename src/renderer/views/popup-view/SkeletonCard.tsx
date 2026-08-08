import { Skeleton } from "../../components/ui/Skeleton";

export function SkeletonCard() {
    return (
        <div className="card">
            <div className="card-head">
                <Skeleton className="h-4 w-24" />
            </div>
            <div className="skeleton-bars">
                <div className="skel-row">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
                <div className="skel-row">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
            </div>
        </div>
    );
}

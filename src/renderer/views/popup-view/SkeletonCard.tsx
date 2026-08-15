import { Card } from "../../components/ui/Card";
import { Skeleton } from "../../components/ui/Skeleton";

export function SkeletonCard() {
    return (
        <Card className="px-4 py-3.5" data-testid="card-skeleton">
            <div className="flex items-center gap-[9px]">
                <Skeleton className="h-4 w-24" />
            </div>
            <div className="mt-3 flex flex-col gap-[9px]">
                <div className="grid grid-cols-[42px_1fr] items-center gap-2.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
                <div className="grid grid-cols-[42px_1fr] items-center gap-2.5">
                    <Skeleton className="h-3 w-10" />
                    <Skeleton className="h-3 w-full" />
                </div>
            </div>
        </Card>
    );
}

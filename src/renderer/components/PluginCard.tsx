import type { PluginInfo } from "../../shared/types/ipc";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";

interface PluginCardProps {
    plugin: PluginInfo;
}

export function PluginCard({ plugin }: PluginCardProps) {
    const { snapshot } = plugin;

    if (snapshot.status === "idle" || snapshot.status === "loading") {
        return (
            <Card>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-full" />
                </div>
            </Card>
        );
    }

    if (snapshot.status === "failed") {
        return (
            <Card>
                <p className="text-sm font-medium">{plugin.displayName}</p>
                <p className="mt-1 text-xs text-[var(--destructive)]">{snapshot.error}</p>
            </Card>
        );
    }

    return (
        <Card>
            <p className="text-sm font-medium">{plugin.displayName}</p>
            <div className="mt-2 space-y-1">
                {snapshot.items.map((item) => (
                    <div key={item.id}>
                        <div className="flex justify-between text-xs">
                            <span>{item.name}</span>
                            <span>
                                {String(item.used)} / {String(item.limit)}
                            </span>
                        </div>
                        <div className="mt-0.5 h-1.5 rounded-full bg-[var(--muted)]">
                            <div
                                className="h-full rounded-full bg-[var(--primary)] transition-all"
                                style={{
                                    width: `${String(Math.min((item.used / item.limit) * 100, 100))}%`,
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

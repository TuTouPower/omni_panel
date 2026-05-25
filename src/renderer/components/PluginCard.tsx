import { useState, useEffect } from "react";
import type { PluginInfo } from "../../shared/types/ipc";
import { Card } from "./Card";
import { Skeleton } from "./Skeleton";
import { relativeTime } from "../lib/utils";

function usagePercent(used: number, limit: number): number {
    return Math.round((used / limit) * 100);
}

function percentColor(pct: number): string {
    if (pct >= 90) return "text-[var(--destructive)]";
    if (pct >= 75) return "text-yellow-500";
    return "";
}

function barColor(pct: number): string {
    if (pct >= 90) return "bg-[var(--destructive)]";
    if (pct >= 75) return "bg-yellow-500";
    return "bg-[var(--primary)]";
}

interface PluginCardProps {
    plugin: PluginInfo;
}

function useRelativeTime(isoDate: string | undefined): string {
    const [text, setText] = useState(() => (isoDate ? relativeTime(isoDate) : ""));
    useEffect(() => {
        if (!isoDate) return;
        const tick = () => {
            setText(relativeTime(isoDate));
        };
        tick();
        const id = setInterval(tick, 1000);
        return () => {
            clearInterval(id);
        };
    }, [isoDate]);
    return text;
}

export function PluginCard({ plugin }: PluginCardProps) {
    const { snapshot } = plugin;
    const updatedAt =
        snapshot.status === "ready"
            ? snapshot.updatedAt
            : snapshot.status === "failed"
              ? snapshot.updatedAt
              : undefined;
    const timeAgo = useRelativeTime(updatedAt);

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
                {snapshot.items && snapshot.items.length > 0 && (
                    <div className="mt-2 space-y-1 opacity-60">
                        {snapshot.items.map((item) => {
                            const pct = usagePercent(item.used, item.limit);
                            return (
                                <div key={item.id}>
                                    <div className="flex justify-between text-xs">
                                        <span>{item.name}</span>
                                        <span>
                                            {String(item.used)} / {String(item.limit)} (
                                            {String(pct)}%)
                                        </span>
                                    </div>
                                    <div className="mt-0.5 h-1.5 rounded-full bg-[var(--muted)]">
                                        <div
                                            className={`h-full rounded-full transition-all ${barColor(pct)}`}
                                            style={{ width: `${String(Math.min(pct, 100))}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                        {snapshot.updatedAt && (
                            <p className="text-xs text-[var(--muted-foreground)]">
                                最后成功: {timeAgo}
                            </p>
                        )}
                    </div>
                )}
                <p className="mt-2 text-xs text-[var(--muted-foreground)]">
                    {snapshot.error.includes("key") || snapshot.error.includes("Key")
                        ? "请前往设置配置密钥"
                        : "点击刷新按钮重试"}
                </p>
            </Card>
        );
    }

    return (
        <Card>
            <p className="text-sm font-medium">{plugin.displayName}</p>
            <div className="mt-2 space-y-1">
                {snapshot.items.map((item) => {
                    const pct = usagePercent(item.used, item.limit);
                    return (
                        <div key={item.id}>
                            <div className="flex justify-between text-xs">
                                <span>{item.name}</span>
                                <span className={percentColor(pct)}>
                                    {String(item.used)} / {String(item.limit)} ({String(pct)}%)
                                </span>
                            </div>
                            <div className="mt-0.5 h-1.5 rounded-full bg-[var(--muted)]">
                                <div
                                    className={`h-full rounded-full transition-all ${barColor(pct)}`}
                                    style={{ width: `${String(Math.min(pct, 100))}%` }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
            <p className="mt-2 text-xs text-[var(--muted-foreground)]">{timeAgo}</p>
        </Card>
    );
}

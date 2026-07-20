import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { UpcomingResetItem } from "../lib/provider-usage";
import { UpcomingResetRow } from "./UpcomingResetRow";

interface UpcomingResetRailProps {
    items: UpcomingResetItem[];
    onSelectProvider: (provider: UsageProvider) => void;
    desensitizeRemarks?: boolean | undefined;
}

export function UpcomingResetRail({
    items,
    onSelectProvider,
    desensitizeRemarks = false,
}: UpcomingResetRailProps) {
    return (
        <aside className="upcoming-rail" aria-label="即将重置">
            <div className="ur-title">即将重置（7 天内）</div>
            {items.length === 0 ? (
                <div className="ur-empty">未来 7 天内暂无重置</div>
            ) : (
                <div className="ur-list">
                    {items.map((item) => {
                        const key = `${item.accountId}:${item.metricLabel}:${String(item.resetAt)}`;
                        return (
                            <UpcomingResetRow
                                key={key}
                                item={item}
                                onSelectProvider={onSelectProvider}
                                desensitizeRemarks={desensitizeRemarks}
                            />
                        );
                    })}
                </div>
            )}
        </aside>
    );
}

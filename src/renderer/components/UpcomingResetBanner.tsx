import { useState } from "react";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import type { UpcomingResetItem } from "../lib/provider-usage";
import { CollapsibleCard } from "./CollapsibleCard";
import { UpcomingResetRow } from "./UpcomingResetRow";

interface UpcomingResetBannerProps {
    items: UpcomingResetItem[];
    onSelectProvider: (provider: UsageProvider) => void;
    desensitizeRemarks?: boolean | undefined;
}

export function UpcomingResetBanner({
    items,
    onSelectProvider,
    desensitizeRemarks = false,
}: UpcomingResetBannerProps) {
    const [collapsed, set_collapsed] = useState(true);

    if (items.length === 0) {
        return (
            <div className="card upcoming-banner" aria-label="即将重置">
                <div className="card-head">
                    <div className="ur-banner-head">
                        <span className="card-name">即将重置</span>
                        <span className="ur-count">0 项</span>
                    </div>
                </div>
                <div className="ur-empty">未来 7 天内暂无重置</div>
            </div>
        );
    }

    const header = (
        <div className="ur-banner-head">
            <span className="card-name">即将重置</span>
            <span className="ur-count">{items.length} 项</span>
        </div>
    );

    return (
        <CollapsibleCard
            header={header}
            collapsed={collapsed}
            onToggle={() => {
                set_collapsed((v) => !v);
            }}
            toggleLabel={collapsed ? "展开即将重置" : "折叠即将重置"}
            className="upcoming-banner"
        >
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
        </CollapsibleCard>
    );
}

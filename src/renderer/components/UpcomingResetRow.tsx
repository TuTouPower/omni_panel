import type { UpcomingResetItem } from "../lib/provider-usage";
import { format_reset_time } from "../lib/utils";
import { VendorMark } from "./Icon";

export interface UpcomingResetRowProps {
    item: UpcomingResetItem;
    onSelectProvider: (provider: string) => void;
    desensitizeRemarks?: boolean | undefined;
}

const STATUS_DOT_CLASS: Record<UpcomingResetItem["status"], string> = {
    critical: "dot red",
    warning: "dot amber",
    normal: "dot green",
    unknown: "dot",
};

export function UpcomingResetRow({
    item,
    onSelectProvider,
    desensitizeRemarks = false,
}: UpcomingResetRowProps) {
    const account_label = desensitizeRemarks ? "" : item.accountLabel;
    return (
        <button
            type="button"
            className="ur-row"
            onClick={() => {
                onSelectProvider(item.provider);
            }}
            title={`切换到 ${item.provider} · ${item.metricLabel}`}
            aria-label={`切换到 ${item.provider} · ${item.metricLabel}`}
        >
            <VendorMark id={item.provider} size={22} />
            <span className="ur-meta">
                <span className="ur-account">
                    {account_label && <span className="ur-acct-label">{account_label}</span>}
                    <span className="ur-metric">{item.metricLabel}</span>
                </span>
                <span className="ur-reset">{format_reset_time(item.resetAt)}</span>
            </span>
            <span className="ur-pct">{item.percent}%</span>
            <span
                className={STATUS_DOT_CLASS[item.status]}
                aria-hidden="true"
                data-status={item.status}
            />
        </button>
    );
}

import type { UpcomingResetItem } from "../lib/provider-usage";
import { format_reset_time } from "../lib/utils";
import { VendorMark } from "./Icon";

export interface UpcomingResetRowProps {
    item: UpcomingResetItem;
    onSelectProvider: (provider: string) => void;
    desensitizeRemarks?: boolean | undefined;
}

const STATUS_DOT_CLASS: Record<UpcomingResetItem["status"], string> = {
    critical:
        "h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--color-error)] " +
        "ring-[3px] ring-[color-mix(in_srgb,var(--color-error)_18%,transparent)]",
    warning:
        "h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--color-warning)] " +
        "ring-[3px] ring-[color-mix(in_srgb,var(--color-warning)_18%,transparent)]",
    normal:
        "h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--color-success)] " +
        "ring-[3px] ring-[color-mix(in_srgb,var(--color-success)_18%,transparent)]",
    unknown: "h-[7px] w-[7px] shrink-0 rounded-full bg-[var(--color-on-surface-muted)]",
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
            className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg border-0 bg-transparent px-1.5 py-2 text-left [font-family:inherit] transition-feedback hover:bg-[var(--color-surface-raised)]"
            data-testid="ur-row"
            onClick={() => {
                onSelectProvider(item.provider);
            }}
            title={`切换到 ${item.provider} · ${item.metricLabel}`}
            aria-label={`切换到 ${item.provider} · ${item.metricLabel}`}
        >
            <VendorMark id={item.provider} size={22} />
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex min-w-0 items-center gap-1.5">
                    {account_label && (
                        <span className="min-w-0 shrink truncate text-[12px] text-[var(--color-on-surface-muted)]">
                            {account_label}
                        </span>
                    )}
                    <span className="min-w-0 shrink truncate text-[13px] font-semibold text-[var(--color-on-surface)]">
                        {item.metricLabel}
                    </span>
                </span>
                <span className="whitespace-nowrap text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                    {format_reset_time(item.resetAt)}
                </span>
            </span>
            <span className="shrink-0 text-[12.5px] font-[650] tabular-nums text-[var(--color-on-surface)]">
                {item.percent}%
            </span>
            <span
                className={STATUS_DOT_CLASS[item.status]}
                aria-hidden="true"
                data-status={item.status}
                data-testid="status-dot"
            />
        </button>
    );
}

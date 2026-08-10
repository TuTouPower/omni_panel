import { useState } from "react";
import { Icon } from "./Icon";
import { Segmented } from "./ui/Segmented";

type TokenTimeRange = "today" | "week" | "month";

interface TokenPanelProps {
    total_tokens?: number;
    /** Whether the total_tokens value is based on real units. */
    has_real_data: boolean;
}

const RANGE_OPTIONS: { value: TokenTimeRange; label: string }[] = [
    { value: "today", label: "今天" },
    { value: "week", label: "最近一周" },
    { value: "month", label: "最近一月" },
];

export function TokenPanel({ total_tokens, has_real_data }: TokenPanelProps) {
    const [range, setRange] = useState<TokenTimeRange>("today");

    const display_value =
        has_real_data && total_tokens !== undefined
            ? total_tokens.toLocaleString()
            : "暂无历史数据";

    return (
        <div
            className="rounded-[var(--radius-lg)] border-[0.5px] border-[var(--color-outline)] bg-[var(--color-surface-card)] px-4 pb-3.5 pt-[15px] shadow-card dark:shadow-card-dark"
            data-testid="token-panel"
        >
            <div className="mb-3 flex items-center gap-[7px]">
                <div className="-ml-1 -mr-0.5 text-[var(--color-on-surface-muted)]">
                    <Icon name="grip" size={14} />
                </div>
                <span className="truncate text-[15.5px] font-[650] tracking-[-0.01em] text-[var(--color-on-surface)]">
                    Total Tokens
                </span>
                <Segmented
                    size="sm"
                    className="ml-auto shrink-0"
                    aria-label="Token 时间范围"
                    options={RANGE_OPTIONS}
                    value={range}
                    onChange={setRange}
                />
            </div>
            <div className="flex items-baseline gap-2">
                <span
                    className={
                        "tabular-nums tracking-[-0.02em] " +
                        (has_real_data
                            ? "text-[28px] font-bold text-[var(--color-on-surface)]"
                            : "text-[14px] font-[450] text-[var(--color-on-surface-muted)]")
                    }
                    data-testid="token-value"
                >
                    {display_value}
                </span>
            </div>
        </div>
    );
}

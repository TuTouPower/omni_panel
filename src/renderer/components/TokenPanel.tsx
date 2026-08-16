import { Icon } from "./Icon";
import { Card } from "./ui/Card";

interface TokenPanelProps {
    total_tokens?: number;
    /** Whether the total_tokens value is based on real units. */
    has_real_data: boolean;
}

export function TokenPanel({ total_tokens, has_real_data }: TokenPanelProps) {
    const display_value =
        has_real_data && total_tokens !== undefined
            ? total_tokens.toLocaleString()
            : "暂无历史数据";

    return (
        <Card className="px-4 pb-3.5 pt-4" data-testid="token-panel">
            <div className="mb-3 flex items-center gap-2">
                <div className="-ml-1 -mr-0.5 text-[var(--color-on-surface-muted)]">
                    <Icon name="grip" size={14} />
                </div>
                <span className="truncate text-[length:var(--text-title-sm)] font-[650] tracking-[-0.01em] text-[var(--color-on-surface)]">
                    Total Tokens
                </span>
            </div>
            <div className="flex items-baseline gap-2">
                <span
                    className={
                        "tabular-nums tracking-[-0.02em] " +
                        (has_real_data
                            ? "text-[length:var(--text-display-num)] font-bold text-[var(--color-on-surface)]"
                            : "text-[length:var(--text-body-md)] font-[450] text-[var(--color-on-surface-muted)]")
                    }
                    data-testid="token-value"
                >
                    {display_value}
                </span>
            </div>
        </Card>
    );
}

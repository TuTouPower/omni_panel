import { useState } from "react";
import { Icon } from "./Icon";

type TokenTimeRange = "today" | "week" | "month";

interface TokenPanelProps {
    total_tokens?: number;
    /** Whether the total_tokens value is based on real units. */
    has_real_data: boolean;
}

const RANGE_LABELS: Record<TokenTimeRange, string> = {
    today: "今天",
    week: "最近一周",
    month: "最近一月",
};

export function TokenPanel({ total_tokens, has_real_data }: TokenPanelProps) {
    const [range, setRange] = useState<TokenTimeRange>("today");

    const display_value =
        has_real_data && total_tokens !== undefined
            ? total_tokens.toLocaleString()
            : "暂无历史数据";

    return (
        <div className="card token-card">
            <div className="tokens-head">
                <div className="card-grip">
                    <Icon name="grip" size={14} />
                </div>
                <span className="card-name">Total Tokens</span>
                <div className="seg">
                    {(Object.keys(RANGE_LABELS) as TokenTimeRange[]).map((key) => (
                        <button
                            key={key}
                            type="button"
                            className={range === key ? "on" : ""}
                            onClick={() => {
                                setRange(key);
                            }}
                        >
                            {RANGE_LABELS[key]}
                        </button>
                    ))}
                </div>
            </div>
            <div className="token-metric">
                <span className={"token-value" + (has_real_data ? "" : " token-na")}>
                    {display_value}
                </span>
            </div>
        </div>
    );
}

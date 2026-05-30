import type { UsageItem } from "../../shared/schemas/plugin-output";

const DOT_COLORS = ["#4c63e6", "#14b8a6", "#e6a23a", "#9b5de5", "#f25f8a", "#22c55e", "#3d7afd"];

function formatTokenValue(value: number): { val: string; unit: string } {
    if (value >= 1_000_000) return { val: (value / 1_000_000).toFixed(1), unit: "M" };
    if (value >= 1_000) return { val: (value / 1_000).toFixed(1), unit: "K" };
    return { val: String(Math.round(value)), unit: "" };
}

interface TokenGridProps {
    items: readonly UsageItem[];
}

export function TokenGrid({ items }: TokenGridProps) {
    if (items.length === 0) return null;

    return (
        <div className="ub-tokens">
            {items.map((item, i) => {
                const { val, unit } = formatTokenValue(item.used);
                return (
                    <div key={item.id}>
                        <div className="ub-tok-head">
                            <span
                                className="ub-tok-dot"
                                style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
                            />
                            <span className="ub-tok-name">{item.name}</span>
                        </div>
                        <div className="ub-tok-val">
                            {val}
                            {unit && <span className="ub-tok-unit">{unit}</span>}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

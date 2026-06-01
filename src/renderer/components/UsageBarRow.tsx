import type { ReactNode } from "react";

interface UsageBarRowProps {
    label: string | ReactNode;
    value: string | ReactNode;
    fill_pct: number;
    /** Changes to danger styling when >= this threshold. Default 75. */
    danger_threshold?: number;
    color?: "blue" | "purple";
}

export function UsageBarRow({
    label,
    value,
    fill_pct,
    danger_threshold = 75,
    color = "blue",
}: UsageBarRowProps) {
    const is_danger = fill_pct >= danger_threshold;
    const clamped = Math.max(0, Math.min(100, fill_pct));

    return (
        <div className="bar-row">
            <span className="bar-lbl">{label}</span>
            <div className="track">
                <div
                    className={`fill ${color}` + (is_danger ? " danger" : "")}
                    style={{ width: `${String(clamped)}%` }}
                />
            </div>
            <span className="bar-pct">{String(Math.round(clamped))}%</span>
            <span className="bar-val">{value}</span>
        </div>
    );
}

import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface KpiProps {
    value: ReactNode;
    label?: ReactNode;
    className?: string;
}

/** t269: 统一 KPI 数字（DESIGN.md kpi 形态，display-num 字阶）。 */
export function Kpi({ value, label, className }: KpiProps) {
    return (
        <div className={cn("flex flex-col", className)}>
            <span className="metric-num text-[length:var(--text-display-num)] font-bold tracking-tight text-[var(--color-on-surface)]">
                {value}
            </span>
            {label !== undefined && (
                <span className="text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]">
                    {label}
                </span>
            )}
        </div>
    );
}

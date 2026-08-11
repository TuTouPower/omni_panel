import { cn } from "../../lib/utils";

/** 风险阶梯：usage 占比 → 风险色 token（对齐 usage-colors.ts 阈值 0.6/0.85/0.95）。 */
function risk_color(ratio: number): string {
    if (ratio >= 0.95) return "var(--color-risk-critical)";
    if (ratio > 0.85) return "var(--color-risk-high)";
    if (ratio > 0.6) return "var(--color-risk-mid)";
    return "var(--color-success)";
}

interface ProgressProps {
    /** 0..1 使用比例。 */
    value: number;
    /** thin 细线 / capsule 胶囊（数值内嵌）。 */
    variant?: "thin" | "capsule";
    /** 胶囊形态内嵌文本（如 "72%"）。 */
    label?: string;
    className?: string;
}

/** t269: 统一 Progress——细线/胶囊双形态，共用风险阶梯填充色。 */
export function Progress({ value, variant = "thin", label, className }: ProgressProps) {
    const clamped = Math.max(0, Math.min(1, value));
    const fill = risk_color(clamped);
    const width = `${String(Math.round(clamped * 100))}%`;

    if (variant === "capsule") {
        return (
            <div
                className={cn(
                    "relative h-[22px] overflow-hidden rounded-full bg-[var(--color-surface-raised)]",
                    className,
                )}
                role="progressbar"
                aria-valuenow={Math.round(clamped * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
            >
                <div
                    className="absolute inset-y-0 left-0 transition-[width]"
                    style={{ width, backgroundColor: fill }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-[length:var(--text-label-md)] text-[var(--color-on-surface)]">
                    {label ?? `${String(Math.round(clamped * 100))}%`}
                </span>
            </div>
        );
    }
    return (
        <div
            className={cn(
                "h-[6px] w-full overflow-hidden rounded-full bg-[var(--color-surface-raised)]",
                className,
            )}
            role="progressbar"
            aria-valuenow={Math.round(clamped * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
        >
            <div className="h-full transition-[width]" style={{ width, backgroundColor: fill }} />
        </div>
    );
}

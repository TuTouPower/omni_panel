import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface SegmentedOption<T extends string> {
    value: T;
    label: ReactNode;
    disabled?: boolean;
    title?: string;
    "aria-label"?: string;
    "data-testid"?: string;
}

interface SegmentedProps<T extends string> {
    options: readonly SegmentedOption<T>[];
    value: T | "" | null;
    onChange: (value: T) => void;
    size?: "sm" | "default";
    className?: string;
    "aria-label"?: string;
}

/** t269: 统一 Segmented（分段控件）。只消费语义 token。t421: option 支持 title/aria-label/data-testid。 */
export function Segmented<T extends string>({
    options,
    value,
    onChange,
    size = "default",
    className,
    "aria-label": ariaLabel,
}: SegmentedProps<T>) {
    return (
        <div
            role="group"
            aria-label={ariaLabel}
            className={cn(
                "inline-flex items-center gap-0.5 rounded-md bg-[var(--color-surface-raised)] p-0.5",
                className,
            )}
        >
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    disabled={opt.disabled}
                    title={opt.title}
                    aria-label={opt["aria-label"]}
                    aria-pressed={value === opt.value}
                    data-testid={opt["data-testid"]}
                    className={cn(
                        "rounded transition-feedback disabled:pointer-events-none disabled:opacity-50 " +
                            "focus-visible:outline-none focus-visible:ring-2 " +
                            "focus-visible:ring-[var(--color-accent-ring)]",
                        size === "sm"
                            ? "px-2 py-0.5 text-[length:var(--text-body-sm)]"
                            : "px-3 py-1 text-[length:var(--text-label-md)]",
                        value === opt.value
                            ? "bg-[var(--color-surface-window)] text-[var(--color-on-surface)] shadow-card"
                            : "text-[var(--color-on-surface-variant)] hover:text-[var(--color-on-surface)]",
                    )}
                    onClick={() => {
                        onChange(opt.value);
                    }}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

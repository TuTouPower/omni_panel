import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface SegmentedProps<T extends string> {
    options: readonly { value: T; label: ReactNode }[];
    value: T;
    onChange: (value: T) => void;
    className?: string;
}

/** t269: 统一 Segmented（分段控件）。只消费语义 token。 */
export function Segmented<T extends string>({
    options,
    value,
    onChange,
    className,
}: SegmentedProps<T>) {
    return (
        <div
            className={cn(
                "inline-flex items-center gap-0.5 rounded-md bg-[var(--color-surface-raised)] p-0.5",
                className,
            )}
        >
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className={cn(
                        "rounded px-3 py-1 text-label-md transition-feedback " +
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                        value === opt.value
                            ? "bg-[var(--color-surface-window)] text-[var(--color-on-surface)] shadow-sm"
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

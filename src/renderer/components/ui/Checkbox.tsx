import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type CheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type">;

/**
 * t269: 统一 Checkbox。用 accent-color 让原生勾按 accent 上色（无需自绘勾 SVG）。
 * 只消费语义 token。
 */
export function Checkbox({ className, ...props }: CheckboxProps) {
    return (
        <input
            type="checkbox"
            className={cn(
                "h-4 w-4 rounded border-[var(--color-outline)] " +
                    "accent-[var(--color-accent)] " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] " +
                    "disabled:opacity-50",
                className,
            )}
            {...props}
        />
    );
}

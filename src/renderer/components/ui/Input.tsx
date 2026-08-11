import type { InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    invalid?: boolean;
}

const base =
    "h-9 w-full rounded-md border border-[var(--color-outline)] bg-[var(--color-field-bg)] " +
    "px-3 text-[length:var(--text-body-md)] text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-muted)] " +
    "focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 " +
    "focus-visible:ring-[var(--color-accent-ring)] disabled:opacity-50";

/** t269: 统一 Input。只消费语义 token。 */
export function Input({ invalid, className, ...props }: InputProps) {
    return (
        <input
            className={cn(base, invalid && "border-[var(--color-error)]", className)}
            {...props}
        />
    );
}

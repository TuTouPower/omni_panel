import type { TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
    invalid?: boolean;
}

const base =
    "w-full rounded-md border border-[var(--color-outline)] bg-[var(--color-field-bg)] " +
    "px-3 py-2 text-body-md text-[var(--color-on-surface)] placeholder:text-[var(--color-on-surface-muted)] " +
    "focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 " +
    "focus-visible:ring-[var(--color-accent-ring)] disabled:opacity-50";

/** t269: 统一 Textarea。 */
export function Textarea({ invalid, className, ...props }: TextareaProps) {
    return (
        <textarea
            className={cn(base, invalid && "border-[var(--color-error)]", className)}
            {...props}
        />
    );
}

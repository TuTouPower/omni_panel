import type { SelectHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type SelectProps = SelectHTMLAttributes<HTMLSelectElement>;

const base =
    "h-9 w-full appearance-none rounded-md border border-[var(--color-outline)] bg-[var(--color-field-bg)] " +
    "px-3 pr-8 text-body-md text-[var(--color-on-surface)] " +
    "focus-visible:outline-none focus-visible:border-[var(--color-accent)] focus-visible:ring-2 " +
    "focus-visible:ring-[var(--color-accent-ring)] disabled:opacity-50";

/** t269: 统一 Select（自绘箭头）。 */
export function Select({ className, children, ...props }: SelectProps) {
    return (
        <div className="relative">
            <select className={cn(base, className)} {...props}>
                {children}
            </select>
            {/* 自绘下拉箭头（DESIGN.md Select 形态）。 */}
            <svg
                className="pointer-events-none absolute right-2.5 top-1/2 h-2 w-3 -translate-y-1/2 text-[var(--color-on-surface-muted)]"
                viewBox="0 0 10 6"
                fill="currentColor"
                aria-hidden="true"
            >
                <path d="M0 0h10L5 6z" />
            </svg>
        </div>
    );
}

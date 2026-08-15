import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface CodeChipProps extends HTMLAttributes<HTMLElement> {
    children?: ReactNode;
}

/** t422: 只读 code 值 chip——surface-raised 底 + code-md 唯一实现。 */
export function CodeChip({ className, children, ...props }: CodeChipProps) {
    return (
        <code
            className={cn(
                "rounded-md bg-[var(--color-surface-raised)] px-2 py-1.5 " +
                    "font-[var(--font-code-md)] text-[length:var(--text-label-md)] " +
                    "text-[var(--color-on-surface-variant)]",
                className,
            )}
            {...props}
        >
            {children}
        </code>
    );
}

import { cn } from "../lib/utils";
import type { HTMLAttributes } from "react";

type CardProps = HTMLAttributes<HTMLDivElement>;

export function Card({ className, ...props }: CardProps) {
    return (
        <div
            className={cn(
                "rounded-[var(--radius-sm)] border border-[var(--color-outline)] bg-[var(--color-surface-card)] text-[var(--color-on-surface)] p-4",
                className,
            )}
            {...props}
        />
    );
}

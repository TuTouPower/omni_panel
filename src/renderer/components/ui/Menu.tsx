import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface MenuProps {
    children: ReactNode;
    className?: string;
}

interface MenuItemProps {
    children: ReactNode;
    onSelect?: () => void;
    danger?: boolean;
    disabled?: boolean;
    className?: string;
}

/**
 * t269: 统一 Menu（毛玻璃浮层）+ MenuItem。
 * 只消费语义 token；毛玻璃由 @utility glass-menu 提供。
 */
export function Menu({ children, className }: MenuProps) {
    return (
        <div
            className={cn(
                "glass-menu min-w-[160px] rounded-lg border border-[var(--color-outline)] p-1",
                className,
            )}
        >
            {children}
        </div>
    );
}

export function MenuItem({ children, onSelect, danger, disabled, className }: MenuItemProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={cn(
                "flex w-full items-center gap-2 rounded px-3 py-1.5 text-[length:var(--text-body-sm)] " +
                    "text-[var(--color-on-surface)] hover:bg-[var(--color-surface-raised)] " +
                    "disabled:pointer-events-none disabled:opacity-50 " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                danger && "text-[var(--color-error)]",
                className,
            )}
            onClick={onSelect}
        >
            {children}
        </button>
    );
}

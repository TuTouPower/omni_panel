import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface MenuProps {
    children: ReactNode;
    className?: string;
    "data-testid"?: string;
    role?: HTMLAttributes<HTMLDivElement>["role"];
    "aria-label"?: string;
}

interface MenuItemProps {
    children: ReactNode;
    onSelect?: () => void;
    danger?: boolean;
    disabled?: boolean;
    className?: string;
    "aria-label"?: string;
    "aria-pressed"?: boolean | "true" | "false";
    "aria-checked"?: boolean | "true" | "false";
    role?: HTMLAttributes<HTMLButtonElement>["role"];
}

/**
 * t269: 统一 Menu（毛玻璃浮层）+ MenuItem。
 * 只消费语义 token；毛玻璃由 @utility glass-menu 提供。
 * t421: Menu 透传 data-testid/role/aria-label；MenuItem 透传 a11y 属性。
 */
export function Menu({
    children,
    className,
    "data-testid": data_testid,
    role,
    "aria-label": aria_label,
}: MenuProps) {
    return (
        <div
            className={cn(
                "glass-menu min-w-[160px] rounded-lg border border-[var(--color-outline)] p-1",
                className,
            )}
            data-testid={data_testid}
            role={role}
            aria-label={aria_label}
        >
            {children}
        </div>
    );
}

export function MenuItem({
    children,
    onSelect,
    danger,
    disabled,
    className,
    "aria-label": aria_label,
    "aria-pressed": aria_pressed,
    "aria-checked": aria_checked,
    role,
}: MenuItemProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            role={role}
            aria-label={aria_label}
            aria-pressed={aria_pressed}
            aria-checked={aria_checked}
            className={cn(
                "flex w-full items-center gap-2 rounded px-3 py-1.5 text-[length:var(--text-body-sm)] " +
                    "text-[var(--color-on-surface)] hover:bg-[var(--color-primary)] hover:text-[var(--color-on-primary)] " +
                    "disabled:pointer-events-none disabled:opacity-50 " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                danger &&
                    "text-[var(--color-error)] hover:bg-[var(--color-error)] hover:text-[var(--color-on-primary)]",
                className,
            )}
            onClick={onSelect}
        >
            {children}
        </button>
    );
}

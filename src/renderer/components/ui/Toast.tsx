import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ToastProps extends HTMLAttributes<HTMLDivElement> {
    children?: ReactNode;
}

/** t422: 底部居中 toast 浮层唯一实现（会话库 / 工作区共用）。 */
export function Toast({ className, children, ...props }: ToastProps) {
    return (
        <div
            className={cn(
                "fixed bottom-7 left-1/2 z-[var(--z-context)] -translate-x-1/2 " +
                    "rounded-lg border border-[var(--color-outline)] " +
                    "bg-[color-mix(in_srgb,var(--color-surface-window)_92%,transparent)] " +
                    "px-[18px] py-2 text-[length:var(--text-body-md)] font-medium " +
                    "text-[var(--color-on-surface)] shadow-menu",
                className,
            )}
            {...props}
        >
            {children}
        </div>
    );
}

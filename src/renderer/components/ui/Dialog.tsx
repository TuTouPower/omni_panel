import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface DialogProps {
    open: boolean;
    onClose: () => void;
    /** 372 标准 / 420 宽（DESIGN.md Dialog 双宽）。 */
    width?: 372 | 420;
    title?: ReactNode;
    children?: ReactNode;
    footer?: ReactNode;
}

/**
 * t269: 统一 Dialog（372/420 双宽 + 遮罩）。只消费语义 token。
 */
export function Dialog({ open, onClose, width = 372, title, children, footer }: DialogProps) {
    if (!open) return null;
    return (
        <div
            className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center"
            role="dialog"
            aria-modal="true"
        >
            <div
                className="absolute inset-0 bg-[color-mix(in_srgb,var(--color-on-surface)_40%,transparent)] backdrop-blur-[3px]"
                onClick={onClose}
                aria-hidden="true"
            />
            <div
                className={cn(
                    "relative z-10 rounded-xl border border-[var(--color-outline)] " +
                        "bg-[var(--color-surface-window)] text-[var(--color-on-surface)] shadow-[var(--shadow-window)]",
                    width === 372 ? "w-[372px]" : "w-[420px]",
                )}
            >
                {title !== undefined && (
                    <div className="border-b border-[var(--color-hairline)] px-[var(--spacing-card-padding)] py-3 text-title-sm">
                        {title}
                    </div>
                )}
                <div className="px-[var(--spacing-card-padding)] py-4">{children}</div>
                {footer !== undefined && (
                    <div className="flex justify-end gap-2 border-t border-[var(--color-hairline)] px-[var(--spacing-card-padding)] py-3">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

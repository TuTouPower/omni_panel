import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface PanelTitleBarProps {
    title: ReactNode;
    /** 右侧动作区（关闭/最小化等）。 */
    actions?: ReactNode;
    className?: string;
}

/** t269: 统一 PanelTitleBar（DESIGN.md panel-titlebar，高 44px）。 */
export function PanelTitleBar({ title, actions, className }: PanelTitleBarProps) {
    return (
        <div
            className={cn(
                "flex h-11 shrink-0 items-center justify-between gap-2 border-b " +
                    "border-[var(--color-hairline)] bg-[var(--color-surface-window)] " +
                    "px-[var(--spacing-panel-padding)] text-body-md text-[var(--color-on-surface)]",
                className,
            )}
        >
            <div className="truncate">{title}</div>
            {actions !== undefined && <div className="flex items-center gap-1">{actions}</div>}
        </div>
    );
}

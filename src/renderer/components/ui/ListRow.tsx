import type { ReactNode } from "react";
import { cn } from "../../lib/utils";

interface ListRowProps {
    leading?: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    trailing?: ReactNode;
    onClick?: () => void;
    selected?: boolean;
    className?: string;
}

/** t269: 统一 ListRow（列表行）。只消费语义 token。 */
export function ListRow({
    leading,
    title,
    subtitle,
    trailing,
    onClick,
    selected,
    className,
}: ListRowProps) {
    const Tag = onClick ? "button" : "div";
    return (
        <Tag
            type={onClick ? "button" : undefined}
            onClick={onClick}
            className={cn(
                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left " +
                    "text-[var(--color-on-surface)] hover:bg-[var(--color-surface-raised)] " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                selected && "bg-[var(--color-primary-container)]",
                className,
            )}
        >
            {leading !== undefined && <div className="shrink-0">{leading}</div>}
            <div className="min-w-0 flex-1">
                <div className="truncate text-[length:var(--text-body-md)]">{title}</div>
                {subtitle !== undefined && (
                    <div className="truncate text-[length:var(--text-body-sm)] text-[var(--color-on-surface-variant)]">
                        {subtitle}
                    </div>
                )}
            </div>
            {trailing !== undefined && <div className="shrink-0">{trailing}</div>}
        </Tag>
    );
}

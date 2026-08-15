import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

export type AlertTone = "error" | "warning" | "success";

interface AlertProps extends HTMLAttributes<HTMLDivElement> {
    /** 语义色浅底：error/warning/success（12% color-mix，DESIGN 授权先例）。 */
    tone?: AlertTone;
    children?: ReactNode;
}

const tones: Record<AlertTone, string> = {
    error:
        "bg-[color-mix(in_srgb,var(--color-error)_12%,transparent)] text-[var(--color-error)]",
    warning:
        "bg-[color-mix(in_srgb,var(--color-warning)_12%,transparent)] text-[var(--color-warning)]",
    success:
        "bg-[color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]",
};

/** t422: 告警/提示条——三语义 12% 浅底容器唯一实现。 */
export function Alert({ tone = "error", className, children, ...props }: AlertProps) {
    return (
        <div
            className={cn(
                "rounded-md px-3 py-2 text-[length:var(--text-body-sm)]",
                tones[tone],
                className,
            )}
            {...props}
        >
            {children}
        </div>
    );
}

import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> {
    checked: boolean;
    onChange: (checked: boolean) => void;
}

/** t269: 统一 Switch（滑动开关）。只消费语义 token。 */
export function Switch({ checked, onChange, className, ...props }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            className={cn(
                "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-feedback " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] " +
                    (checked ? "bg-[var(--color-accent)]" : "bg-[var(--color-on-surface-muted)]"),
                className,
            )}
            onClick={() => {
                onChange(!checked);
            }}
            {...props}
        >
            <span
                className={cn(
                    "pointer-events-none block h-4 w-4 rounded-full bg-[var(--color-surface-window)] shadow transition-transform",
                    checked ? "translate-x-[18px]" : "translate-x-0.5",
                )}
            />
        </button>
    );
}

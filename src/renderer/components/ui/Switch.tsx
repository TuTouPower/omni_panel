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
                "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-feedback " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] " +
                    (checked ? "bg-[var(--color-success)]" : "bg-[var(--color-surface-raised)]"),
                className,
            )}
            onClick={() => {
                onChange(!checked);
            }}
            {...props}
        >
            <span
                className={cn(
                    "pointer-events-none block h-[18px] w-[18px] rounded-full bg-[var(--color-on-surface)] shadow transition-transform",
                    checked ? "translate-x-[18px]" : "translate-x-0.5",
                )}
            />
        </button>
    );
}

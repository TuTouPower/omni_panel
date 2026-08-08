import { useState, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type SecretInputProps = InputHTMLAttributes<HTMLInputElement>;

/**
 * t269: 统一 SecretInput——等宽脱敏输入 + 显隐切换。
 * 只消费语义 token。
 */
export function SecretInput({ className, ...props }: SecretInputProps) {
    const [show, set_show] = useState(false);
    return (
        <div className="relative">
            <input
                type={show ? "text" : "password"}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className={cn(
                    "h-9 w-full rounded-md border border-[var(--color-outline)] bg-[var(--color-field-bg)] " +
                        "pr-9 pl-3 font-[var(--font-code-md)] text-body-md text-[var(--color-on-surface)] " +
                        "focus-visible:outline-none focus-visible:border-[var(--color-accent)] " +
                        "focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] disabled:opacity-50",
                    className,
                )}
                {...props}
            />
            <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[var(--color-on-surface-muted)] hover:text-[var(--color-on-surface)]"
                onClick={() => {
                    set_show((v) => !v);
                }}
                title={show ? "隐藏" : "显示"}
                aria-label={show ? "隐藏" : "显示"}
            >
                {show ? "🙈" : "👁"}
            </button>
        </div>
    );
}

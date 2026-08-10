import type { ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "icon";
type ButtonSize = "standard" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
}

const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md text-body-md font-medium " +
    "transition-feedback disabled:pointer-events-none disabled:opacity-50 " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-0";

const variants: Record<ButtonVariant, string> = {
    primary:
        "bg-[var(--color-primary)] text-[var(--color-on-primary)] hover:bg-[var(--color-primary-strong)]",
    secondary:
        "bg-[var(--color-surface-window)] text-[var(--color-on-surface)] border border-[var(--color-outline)] hover:bg-[var(--color-surface-raised)]",
    danger: "bg-[var(--color-error)] text-[var(--color-on-primary)] hover:opacity-90",
    ghost: "bg-transparent text-[var(--color-primary)] hover:bg-[var(--color-primary-container)]",
    icon: "bg-transparent text-[var(--color-on-surface-variant)] hover:bg-[var(--color-surface-raised)]",
};

const sizes: Record<ButtonSize, string> = {
    standard: "h-9 px-[18px]",
    // text-[length:...] 显式字号：避免 tailwind-merge 把自定义字号 token（--text-label-md）
    // 误判为颜色类，吞掉 primary/danger 的 text-[var(--color-on-primary)]（t283 实测）。
    sm: "h-8 px-3 text-[length:var(--text-label-md)]",
};

/** t269: 统一 Button（DESIGN.md button-* 形态全集）。只消费语义 token。 */
export function Button({
    variant = "primary",
    size = "standard",
    className,
    type = "button",
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            className={cn(base, variants[variant], sizes[size], className)}
            {...props}
        />
    );
}

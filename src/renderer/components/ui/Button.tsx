import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/utils";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost" | "icon" | "text";
type ButtonSize =
    | "standard"
    | "sm"
    | "inline"
    | "icon"
    | "icon-md"
    | "icon-sm"
    | "icon-xs";

interface ButtonBaseProps {
    variant?: ButtonVariant;
    size?: ButtonSize;
    className?: string | undefined;
    children?: ReactNode;
}

type ButtonAsButtonProps = ButtonBaseProps &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ButtonBaseProps | "href"> & {
        as?: "button";
        href?: undefined;
    };

type ButtonAsLinkProps = ButtonBaseProps &
    Omit<AnchorHTMLAttributes<HTMLAnchorElement>, keyof ButtonBaseProps> & {
        as: "a";
        href: string;
    };

export type ButtonProps = ButtonAsButtonProps | ButtonAsLinkProps;

const base =
    "inline-flex items-center justify-center gap-1.5 rounded-md font-semibold " +
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
    // 行内文字动作钮（accent 色，无固定高）：provider 重登/重试等
    text:
        "bg-transparent text-[var(--color-accent)] " +
        "hover:bg-[color-mix(in_srgb,var(--color-accent)_10%,transparent)]",
};

const sizes: Record<ButtonSize, string> = {
    // text-[length:...] 显式字号：避免 tailwind-merge 把自定义字号 token（--text-body-md）
    // 误判为颜色类，吞掉 primary/danger 的 text-[var(--color-on-primary)]（t298，sm 档 t283）。
    standard: "h-9 px-[18px] text-[length:var(--text-body-md)]",
    sm: "h-8 px-3 text-[length:var(--text-label-md)]",
    inline: "h-auto px-2.5 py-1 text-[12.5px]",
    // icon 尺寸档：DESIGN 默认 32；既有 28/26/22 用量收档
    icon: "h-8 w-8 p-0",
    "icon-md": "h-7 w-7 p-0",
    "icon-sm": "h-[26px] w-[26px] p-0",
    "icon-xs": "h-[22px] w-[22px] p-0",
};

function default_size(variant: ButtonVariant): ButtonSize {
    if (variant === "icon") return "icon";
    if (variant === "text") return "inline";
    return "standard";
}

function button_class(
    variant: ButtonVariant,
    size: ButtonSize,
    className: string | undefined,
    as_link: boolean,
): string {
    return cn(base, variants[variant], sizes[size], as_link && "no-underline", className);
}

/** t269: 统一 Button（DESIGN.md button-* 形态全集）。只消费语义 token。t420: text/icon 尺寸档 + as-link。 */
export function Button(props: ButtonProps) {
    const variant = props.variant ?? "primary";
    const size = props.size ?? default_size(variant);
    const cls = button_class(variant, size, props.className, props.as === "a");

    if (props.as === "a") {
        const { variant: _variant, size: _size, className: _className, as: _as, ...rest } = props;
        void _variant;
        void _size;
        void _className;
        void _as;
        return <a className={cls} {...rest} />;
    }

    const {
        variant: _variant,
        size: _size,
        className: _className,
        as: _as,
        type = "button",
        ...rest
    } = props;
    void _variant;
    void _size;
    void _className;
    void _as;
    return <button type={type} className={cls} {...rest} />;
}

import type { InputHTMLAttributes, MouseEvent, ReactNode } from "react";
import { cn } from "../../lib/utils";

interface SelectCheckboxProps {
    variant: "select" | "order";
    checked?: boolean;
    /** order 形态：选中时显示 1-based 序号。 */
    order?: number | null;
    /** agent 读 `--agent-accent`；primary 读 `--color-primary`。默认 agent。 */
    accent?: "agent" | "primary";
    /** md=20px；lg=22px（SessionCard）。默认 md。 */
    boxSize?: "md" | "lg";
    onClick?: (e: MouseEvent<HTMLElement>) => void;
    "aria-label"?: string;
    className?: string;
    "data-testid"?: string;
    disabled?: boolean;
    /** order 形态可作装饰（父级整行可点）；select 默认 button。 */
    interactive?: boolean;
    children?: ReactNode;
}

type NativeCheckboxProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> & {
    variant?: "native";
};

export type CheckboxProps = NativeCheckboxProps | SelectCheckboxProps;

/**
 * t269: 统一 Checkbox（默认 16px 原生）。
 * t421: 扩展 select（✓ + accent 方块）/ order（序号态）形态，默认 native 不变。
 */
export function Checkbox(props: CheckboxProps) {
    if (props.variant === "select" || props.variant === "order") {
        return <SelectBox {...props} />;
    }
    const { className, ...rest } = props;
    return (
        <input
            type="checkbox"
            className={cn(
                "h-4 w-4 rounded border-[var(--color-outline)] " +
                    "accent-[var(--color-accent)] " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] " +
                    "disabled:opacity-50",
                className,
            )}
            {...rest}
        />
    );
}

function SelectBox({
    variant,
    checked = false,
    order = null,
    accent = "agent",
    boxSize = "md",
    onClick,
    "aria-label": aria_label,
    className,
    "data-testid": data_testid,
    disabled,
    interactive,
}: SelectCheckboxProps) {
    const is_order = variant === "order";
    // order 默认可装饰（嵌在父 button 内）；select 默认可点。
    const as_button = interactive ?? !is_order;
    const size_cls = boxSize === "lg" ? "h-[22px] w-[22px]" : "h-5 w-5";
    const border_w = is_order ? "border-[1.5px]" : "border";
    const accent_border =
        accent === "primary" ? "border-[var(--color-primary)]" : "border-[var(--agent-accent)]";
    const accent_bg =
        accent === "primary" ? "bg-[var(--color-primary)]" : "bg-[var(--agent-accent)]";
    const hover_border =
        accent === "primary"
            ? "hover:border-[var(--color-primary)]"
            : "hover:border-[var(--agent-accent)]";

    const class_name = cn(
        "flex shrink-0 items-center justify-center rounded-md text-[length:var(--text-label-md)] font-bold",
        size_cls,
        border_w,
        checked
            ? cn(accent_border, accent_bg, "text-[var(--color-on-primary)]", is_order && "on")
            : cn(
                  "border-[var(--color-on-surface-variant)] bg-transparent text-transparent",
                  as_button && hover_border,
              ),
        as_button &&
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)] disabled:opacity-50",
        className,
    );

    const content =
        checked && is_order && order != null && order > 0
            ? String(order)
            : checked && !is_order
              ? "✓"
              : "";

    if (as_button) {
        return (
            <button
                type="button"
                className={class_name}
                aria-label={aria_label}
                aria-pressed={checked}
                data-testid={data_testid}
                disabled={disabled}
                onClick={onClick}
            >
                {content}
            </button>
        );
    }

    return (
        <span
            className={class_name}
            data-testid={data_testid}
            aria-hidden={aria_label ? undefined : true}
        >
            {content}
        </span>
    );
}

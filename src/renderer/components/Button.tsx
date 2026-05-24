import { cn } from "../lib/utils";
import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: "default" | "ghost" | "outline";
    size?: "default" | "sm" | "icon";
}

export function Button({
    variant = "default",
    size = "default",
    className,
    ...props
}: ButtonProps) {
    return (
        <button
            className={cn(
                "inline-flex items-center justify-center rounded-[var(--radius)] text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
                "disabled:pointer-events-none disabled:opacity-50",
                variant === "default" &&
                    "bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary)]/90",
                variant === "ghost" && "hover:bg-[var(--muted)] hover:text-[var(--foreground)]",
                variant === "outline" &&
                    "border border-[var(--border)] bg-transparent hover:bg-[var(--muted)]",
                size === "default" && "h-9 px-4 py-2",
                size === "sm" && "h-8 px-3 text-xs",
                size === "icon" && "h-9 w-9",
                className,
            )}
            {...props}
        />
    );
}

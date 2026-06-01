import { useEffect, useRef, type ReactNode } from "react";

export interface CardMenuItem {
    label: string;
    icon?: ReactNode;
    onClick: () => void;
    danger?: boolean;
    meta?: string;
    checked?: boolean;
}

interface CardMenuProps {
    items: CardMenuItem[];
    open: boolean;
    position: { x: number; y: number };
    onClose: () => void;
}

export function CardMenu({ items, open, position, onClose }: CardMenuProps) {
    const menu_ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const on_click_outside = (e: MouseEvent) => {
            if (menu_ref.current && !menu_ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const on_escape = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        document.addEventListener("mousedown", on_click_outside);
        document.addEventListener("keydown", on_escape);
        return () => {
            document.removeEventListener("mousedown", on_click_outside);
            document.removeEventListener("keydown", on_escape);
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="ctx-overlay" onClick={onClose}>
            <div
                ref={menu_ref}
                className="ctx-menu"
                style={{ left: position.x, top: position.y }}
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                {items.map((item, i) => (
                    <button
                        key={i}
                        type="button"
                        className={"ctx-item" + (item.danger ? " danger" : "")}
                        onClick={() => {
                            item.onClick();
                            onClose();
                        }}
                    >
                        {item.icon && <span className="ci-ic">{item.icon}</span>}
                        {item.label}
                        {item.checked !== undefined && (
                            <span className="ci-check">{item.checked ? "✓" : ""}</span>
                        )}
                        {item.meta && <span className="ci-meta">{item.meta}</span>}
                    </button>
                ))}
            </div>
        </div>
    );
}

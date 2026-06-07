import { useState, useRef, useEffect, useCallback } from "react";
import { Icon } from "./Icon";

export interface CardActionMenuItem {
    key: string;
    label: string;
    icon: string;
    iconSize?: number | undefined;
    danger?: boolean | undefined;
    onSelect: () => void;
}

interface CardActionMenuProps {
    ariaLabel: string;
    title: string;
    triggerIconSize?: number | undefined;
    items: CardActionMenuItem[];
}

export function CardActionMenu({
    ariaLabel,
    title,
    triggerIconSize = 16,
    items,
}: CardActionMenuProps) {
    const [open, set_open] = useState(false);
    const menu_ref = useRef<HTMLDivElement>(null);

    const close = useCallback(() => {
        set_open(false);
    }, []);

    useEffect(() => {
        if (!open) return;
        const on_click = (e: MouseEvent) => {
            if (menu_ref.current && !menu_ref.current.contains(e.target as Node)) {
                close();
            }
        };
        const on_key = (e: KeyboardEvent) => {
            if (e.key === "Escape") close();
        };
        document.addEventListener("mousedown", on_click);
        document.addEventListener("keydown", on_key);
        return () => {
            document.removeEventListener("mousedown", on_click);
            document.removeEventListener("keydown", on_key);
        };
    }, [open, close]);

    return (
        <div className="card-menu-wrap">
            <button
                className="icon-btn"
                aria-label={ariaLabel}
                title={title}
                onClick={(e) => {
                    e.stopPropagation();
                    set_open((v) => !v);
                }}
            >
                <Icon name="more" size={triggerIconSize} />
            </button>
            {open && (
                <>
                    <div className="card-menu-overlay" onClick={close} />
                    <div
                        className="card-menu"
                        ref={menu_ref}
                        onClick={(e) => {
                            e.stopPropagation();
                        }}
                    >
                        {items.map((item) => (
                            <div
                                key={item.key}
                                className={`cm-item${item.danger ? " danger" : ""}`}
                                onClick={() => {
                                    item.onSelect();
                                    close();
                                }}
                            >
                                <span className="cm-ic">
                                    <Icon name={item.icon} size={item.iconSize ?? 15} />
                                </span>
                                {item.label}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

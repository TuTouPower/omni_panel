import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface CollapsibleCardProps {
    /** Header content (always visible: title, summary, status). */
    header: ReactNode;
    /** Optional right-side tools (refresh, select, etc.) rendered before the collapse toggle. */
    tools?: ReactNode;
    /** Details content hidden when collapsed. */
    children?: ReactNode;
    /** Whether the card is currently collapsed. */
    collapsed: boolean;
    /** Called when the user toggles the collapse state. */
    onToggle: () => void;
    /** Optional extra className on the outer card. */
    className?: string;
    /** Accessible label for the collapse toggle. */
    toggleLabel?: string;
}

export function CollapsibleCard({
    header,
    tools,
    children,
    collapsed,
    onToggle,
    className,
    toggleLabel,
}: CollapsibleCardProps) {
    const has_details = children !== undefined && children !== null && children !== false;
    const aria_label = toggleLabel ?? (collapsed ? "展开" : "折叠");

    return (
        <div
            className={
                "card" + (collapsed ? " collapsed" : "") + (className ? ` ${className}` : "")
            }
            data-collapsed={collapsed ? "true" : "false"}
        >
            <div className="card-head">
                {header}
                {(tools !== undefined || has_details) && (
                    <div className="card-tools">
                        {tools}
                        {has_details && (
                            <button
                                type="button"
                                className="icon-btn"
                                aria-label={aria_label}
                                aria-expanded={collapsed ? "false" : "true"}
                                title={aria_label}
                                onClick={onToggle}
                            >
                                <Icon
                                    name="chev_down"
                                    size={16}
                                    style={
                                        collapsed
                                            ? { transform: "rotate(0deg)" }
                                            : { transform: "rotate(180deg)" }
                                    }
                                />
                            </button>
                        )}
                    </div>
                )}
            </div>
            {has_details && !collapsed && children}
        </div>
    );
}

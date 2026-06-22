import type { ReactNode } from "react";
import { Icon } from "./Icon";

interface CollapsibleCardProps {
    header: ReactNode;
    tools?: ReactNode | undefined;
    children?: ReactNode | undefined;
    collapsed: boolean;
    onToggle: () => void;
    className?: string | undefined;
    toggleLabel?: string | undefined;
    dataStatus?: string | undefined;
    /** Extra props forwarded to the root .card div (e.g. draggable, onDragStart). */
    rootProps?: React.HTMLAttributes<HTMLDivElement> | undefined;
}

export function CollapsibleCard({
    header,
    tools,
    children,
    collapsed,
    onToggle,
    className,
    toggleLabel,
    dataStatus,
    rootProps,
}: CollapsibleCardProps) {
    const has_details = children !== undefined && children !== null && children !== false;
    const aria_label = toggleLabel ?? (collapsed ? "展开" : "折叠");

    return (
        <div
            className={
                "card" + (collapsed ? " collapsed" : "") + (className ? ` ${className}` : "")
            }
            data-collapsed={collapsed ? "true" : "false"}
            data-status={dataStatus}
            {...rootProps}
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

import type { ReactNode } from "react";
import { Icon } from "./Icon";
import { Button } from "./ui/Button";
import { Card } from "./ui/Card";
import { cn } from "../lib/utils";

interface CollapsibleCardProps {
    header: ReactNode;
    tools?: ReactNode | undefined;
    children?: ReactNode | undefined;
    collapsed: boolean;
    onToggle: () => void;
    className?: string | undefined;
    toggleLabel?: string | undefined;
    /** When false, the card cannot collapse — no toggle chevron is rendered. */
    collapsible?: boolean | undefined;
    dataStatus?: string | undefined;
    /** Extra props forwarded to the root card div (e.g. draggable, onDragStart). */
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
    collapsible = true,
    dataStatus,
    rootProps,
}: CollapsibleCardProps) {
    const has_details = children !== undefined && children !== null && children !== false;
    const aria_label = toggleLabel ?? (collapsed ? "展开" : "折叠");

    return (
        <Card
            className={cn("px-4 py-3.5", className)}
            data-testid="collapsible-card"
            data-collapsed={collapsed ? "true" : "false"}
            data-status={dataStatus}
            {...rootProps}
        >
            <div className="flex items-center gap-[9px]">
                {header}
                {(tools !== undefined || has_details) && (
                    <div className="ml-auto flex items-center gap-px">
                        {tools}
                        {has_details && collapsible && (
                            <Button
                                type="button"
                                variant="icon"
                                size="sm"
                                className="h-8 w-8 p-0"
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
                            </Button>
                        )}
                    </div>
                )}
            </div>
            {has_details && !collapsed && children}
        </Card>
    );
}

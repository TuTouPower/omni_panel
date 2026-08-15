import type { CSSProperties } from "react";
import { Button } from "../ui/Button";
import { agent_accent } from "../../lib/workspace/slots";
import { agent_friendly } from "../../lib/session-history/markdown";
import { cn } from "../../lib/utils";

interface AgentFilterChipsProps {
    readonly agents: readonly string[];
    readonly counts: readonly [string, number][];
    readonly on_change: (next: string[]) => void;
}

export function AgentFilterChips({ agents, counts, on_change }: AgentFilterChipsProps) {
    return (
        <div className="flex shrink-0 flex-wrap gap-2 border-b border-[var(--color-hairline)] px-[18px] py-2">
            <Button
                variant="ghost"
                size="sm"
                className={cn(
                    "rounded-full border border-[var(--color-outline)] text-[var(--color-on-surface-variant)]",
                    agents.length === 0 &&
                        "border-[var(--color-primary)] bg-[var(--color-primary-container)] text-[var(--color-primary)]",
                )}
                data-testid="library-agent-chip"
                onClick={() => {
                    on_change([]);
                }}
            >
                全部
            </Button>
            {counts.map(([source, count]) => (
                <Button
                    variant="ghost"
                    size="sm"
                    key={source}
                    className={cn(
                        "rounded-full border border-[var(--color-outline)] text-[var(--color-on-surface-variant)]",
                        agents.includes(source) &&
                            "bg-[var(--color-primary-container)] text-[var(--agent-accent)]",
                    )}
                    data-testid="library-agent-chip"
                    style={{ "--agent-accent": agent_accent(source) } as CSSProperties}
                    onClick={() => {
                        on_change(
                            agents.includes(source)
                                ? agents.filter((a) => a !== source)
                                : [...agents, source],
                        );
                    }}
                >
                    <span
                        className="h-2 w-2 rounded-full bg-[var(--agent-accent)]"
                        aria-hidden="true"
                    />
                    {agent_friendly(source)} {String(count)}
                </Button>
            ))}
        </div>
    );
}

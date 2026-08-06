import { agent_friendly } from "../../lib/session-history/markdown";

interface AgentFilterChipsProps {
    readonly agents: readonly string[];
    readonly counts: readonly [string, number][];
    readonly on_change: (next: string[]) => void;
}

export function AgentFilterChips({ agents, counts, on_change }: AgentFilterChipsProps) {
    return (
        <div className="lib-agents">
            <button
                type="button"
                className={"lib-agent-chip" + (agents.length === 0 ? " on" : "")}
                onClick={() => {
                    on_change([]);
                }}
            >
                全部
            </button>
            {counts.map(([source, count]) => (
                <button
                    type="button"
                    key={source}
                    className={"lib-agent-chip" + (agents.includes(source) ? " on" : "")}
                    onClick={() => {
                        on_change(
                            agents.includes(source)
                                ? agents.filter((a) => a !== source)
                                : [...agents, source],
                        );
                    }}
                >
                    <span className="lib-agent-dot" />
                    {agent_friendly(source)} {String(count)}
                </button>
            ))}
        </div>
    );
}

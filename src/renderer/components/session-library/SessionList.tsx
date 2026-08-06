import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { SessionCard } from "./SessionCard";
import { SessionRow } from "./SessionRow";
import { key_of } from "./session-library-utils";

interface SessionListProps {
    readonly view_mode: "grid" | "list";
    readonly sessions: readonly TokenStatsSession[];
    readonly summaries: Readonly<Record<string, string>>;
    readonly selected_ids: ReadonlySet<string>;
    readonly on_toggle: (s: TokenStatsSession) => void;
    readonly on_preview: (s: TokenStatsSession) => void;
    readonly on_open: (s: TokenStatsSession) => void;
}

export function SessionList({
    view_mode,
    sessions,
    summaries,
    selected_ids,
    on_toggle,
    on_preview,
    on_open,
}: SessionListProps) {
    if (view_mode === "grid") {
        return (
            <div className="lib-grid">
                {sessions.map((s) => (
                    <SessionCard
                        key={`${s.source}|${s.env}|${s.id}`}
                        s={s}
                        summary={summaries[key_of(s)] ?? ""}
                        selected={selected_ids.has(key_of(s))}
                        on_toggle={() => {
                            on_toggle(s);
                        }}
                        on_preview={() => {
                            on_preview(s);
                        }}
                        on_open={() => {
                            on_open(s);
                        }}
                    />
                ))}
            </div>
        );
    }
    return (
        <div className="lib-list">
            {sessions.map((s) => (
                <SessionRow
                    key={`${s.source}|${s.env}|${s.id}`}
                    s={s}
                    summary={summaries[key_of(s)] ?? ""}
                    selected={selected_ids.has(key_of(s))}
                    on_toggle={() => {
                        on_toggle(s);
                    }}
                    on_preview={() => {
                        on_preview(s);
                    }}
                    on_open={() => {
                        on_open(s);
                    }}
                />
            ))}
        </div>
    );
}

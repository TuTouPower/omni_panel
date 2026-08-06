import { useCallback } from "react";
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
    const handleToggle = useCallback(
        (s: TokenStatsSession) => {
            on_toggle(s);
        },
        [on_toggle],
    );
    const handlePreview = useCallback(
        (s: TokenStatsSession) => {
            on_preview(s);
        },
        [on_preview],
    );
    const handleOpen = useCallback(
        (s: TokenStatsSession) => {
            on_open(s);
        },
        [on_open],
    );

    if (view_mode === "grid") {
        return (
            <div className="lib-grid">
                {sessions.map((s) => (
                    <SessionCard
                        key={`${s.source}|${s.env}|${s.id}`}
                        s={s}
                        summary={summaries[key_of(s)] ?? ""}
                        selected={selected_ids.has(key_of(s))}
                        on_toggle={handleToggle}
                        on_preview={handlePreview}
                        on_open={handleOpen}
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
                    on_toggle={handleToggle}
                    on_preview={handlePreview}
                    on_open={handleOpen}
                />
            ))}
        </div>
    );
}

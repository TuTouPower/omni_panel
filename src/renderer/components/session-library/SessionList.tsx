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
    /** 复制续接命令成功后提示（t326 透传给 SessionCard）。 */
    readonly on_show_toast?: (message: string) => void;
}

export function SessionList({
    view_mode,
    sessions,
    summaries,
    selected_ids,
    on_toggle,
    on_preview,
    on_open,
    on_show_toast,
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
            <div className="library-grid grid min-h-0 flex-1 grid-cols-[repeat(auto-fill,minmax(280px,1fr))] content-start gap-3 overflow-y-auto px-[18px] py-3.5">
                {sessions.map((s) => (
                    <SessionCard
                        key={`${s.source}|${s.env}|${s.id}`}
                        s={s}
                        selected={selected_ids.has(key_of(s))}
                        on_toggle={handleToggle}
                        on_preview={handlePreview}
                        on_open={handleOpen}
                        show_toast={on_show_toast}
                    />
                ))}
            </div>
        );
    }
    return (
        <div className="library-list flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-[18px] pb-3.5 pt-2">
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

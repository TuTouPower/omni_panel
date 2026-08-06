import type { TokenStatsSession } from "../../../shared/types/token-stats";
import {
    agent_abbrev,
    format_tokens,
    relative_date,
    session_tokens,
} from "./session-library-utils";

interface RowProps {
    readonly s: TokenStatsSession;
    readonly summary: string;
    readonly selected: boolean;
    readonly on_toggle: () => void;
    readonly on_preview: () => void;
    readonly on_open: () => void;
}

export function SessionRow({ s, summary, selected, on_toggle, on_preview, on_open }: RowProps) {
    return (
        <div className={"lib-row" + (selected ? " selected" : "")}>
            <button
                type="button"
                className="lib-row-select"
                aria-label={`会话 ${s.id}`}
                onClick={on_toggle}
            >
                {selected ? "✓" : ""}
            </button>
            <span className="lib-row-badge">{agent_abbrev(s.source)}</span>
            <span className="lib-row-title">{s.title ?? s.id}</span>
            <span className="lib-row-summary">{summary}</span>
            <span className="lib-row-meta mono">
                {String(s.calls)} 轮 · {format_tokens(session_tokens(s))} tokens ·{" "}
                {relative_date(s.ended_at)}
            </span>
            <span className="lib-row-dir">{s.directory ?? "—"}</span>
            <button type="button" onClick={on_open}>
                单独打开
            </button>
            <button type="button" aria-label="预览" onClick={on_preview}>
                预览
            </button>
        </div>
    );
}

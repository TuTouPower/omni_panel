import { memo } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_abbrev, relative_date } from "./session-library-utils";
import { format_tokens, session_tokens } from "./session-library-utils";

interface CardProps {
    readonly s: TokenStatsSession;
    readonly summary: string;
    readonly selected: boolean;
    readonly on_toggle: (s: TokenStatsSession) => void;
    readonly on_preview: (s: TokenStatsSession) => void;
    readonly on_open: (s: TokenStatsSession) => void;
    /** 测试用渲染计数回调。 */
    readonly onRender?: () => void;
}

export const SessionCard = memo(function SessionCard({
    s,
    summary,
    selected,
    on_toggle,
    on_preview,
    on_open,
    onRender,
}: CardProps) {
    onRender?.();
    return (
        <div className={"lib-card" + (selected ? " selected" : "")}>
            <div className="lib-card-accent" />
            <div className="lib-card-body">
                <div className="lib-card-head">
                    <span className="lib-card-badge">{agent_abbrev(s.source)}</span>
                    <span className="lib-card-title">{s.title ?? s.id}</span>
                </div>
                <div className="lib-card-summary">{summary}</div>
                <div className="lib-card-meta mono">
                    {String(s.calls)} 轮 · {format_tokens(session_tokens(s))} tokens ·{" "}
                    {relative_date(s.ended_at)}
                </div>
                <div className="lib-card-dir">{s.directory ?? "—"}</div>
            </div>
            <div className="lib-card-actions">
                <button type="button" onClick={() => { on_open(s); }}>
                    单独打开
                </button>
                <button type="button" aria-label="预览" onClick={() => { on_preview(s); }}>
                    预览
                </button>
            </div>
            <button
                type="button"
                className="lib-card-select"
                aria-label={`会话 ${s.id}`}
                onClick={() => { on_toggle(s); }}
            >
                {selected ? "✓" : ""}
            </button>
        </div>
    );
});

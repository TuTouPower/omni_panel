import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_slug } from "../../lib/session-history/markdown";
import { session_tokens } from "../../lib/session-library/filter";
import { MarkdownMessage } from "../workspace/MarkdownMessage";
import { agent_abbrev, format_tokens, relative_date } from "./session-library-utils";

interface SessionPreviewProps {
    readonly preview: TokenStatsSession;
    readonly preview_msgs: HistoryMessageLike[];
    readonly on_close: () => void;
    readonly on_open: (s: TokenStatsSession) => void;
    readonly on_toggle_select: (s: TokenStatsSession) => void;
}

export function SessionPreview({
    preview,
    preview_msgs,
    on_close,
    on_open,
    on_toggle_select,
}: SessionPreviewProps) {
    return (
        <div
            className="lib-preview-scrim"
            onClick={() => {
                on_close();
            }}
        >
            <div
                className="lib-preview"
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <div className="lib-preview-head">
                    <span className="lib-preview-agent">{agent_abbrev(preview.source)}</span>
                    <div className="lib-preview-text">
                        <span className="lib-preview-title">{preview.title ?? preview.id}</span>
                        <span className="lib-preview-meta">
                            {agent_slug(preview.source)} · {String(preview.calls)} 轮 ·{" "}
                            {format_tokens(session_tokens(preview))} tokens ·{" "}
                            {relative_date(preview.ended_at)}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="lib-preview-close"
                        aria-label="关闭预览"
                        onClick={() => {
                            on_close();
                        }}
                    >
                        ×
                    </button>
                </div>
                <div className="lib-preview-path">{preview.directory ?? "—"}</div>
                <div className="lib-preview-msgs">
                    {preview_msgs.length === 0 ? (
                        <div className="lib-preview-empty">无消息预览</div>
                    ) : (
                        preview_msgs.map((m) => (
                            <div className="lib-preview-msg" key={m.id}>
                                <span className="lib-preview-role">
                                    {m.role === "user" ? "用户" : "Agent"}
                                </span>
                                <MarkdownMessage text={m.text} />
                            </div>
                        ))
                    )}
                </div>
                <div className="lib-preview-foot">
                    <button
                        type="button"
                        className="lib-preview-btn"
                        onClick={() => {
                            on_open(preview);
                        }}
                    >
                        单独打开
                    </button>
                    <button
                        type="button"
                        className="lib-preview-btn"
                        onClick={() => {
                            on_toggle_select(preview);
                        }}
                    >
                        加入选择
                    </button>
                </div>
            </div>
        </div>
    );
}

import type { CSSProperties } from "react";
import type { HistoryMessageLike } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_slug } from "../../lib/session-history/markdown";
import { agent_accent } from "../../lib/workspace/slots";
import { session_tokens } from "../../lib/session-library/filter";
import { Button } from "../ui/Button";
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
            className="preview-scrim fixed inset-0 z-[var(--z-modal)] flex justify-end bg-[color-mix(in_srgb,var(--color-on-surface)_20%,transparent)]"
            onClick={() => {
                on_close();
            }}
        >
            <div
                className="preview-panel flex h-full w-[420px] min-w-0 flex-col border-l border-[var(--color-outline)] bg-[var(--color-surface-window)] shadow-window"
                style={{ "--agent-accent": agent_accent(preview.source) } as CSSProperties}
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <div className="preview-head flex shrink-0 items-center gap-2.5 border-b border-[var(--color-hairline)] px-4 py-3.5">
                    <span className="preview-agent flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg bg-[var(--agent-accent)] text-[length:var(--text-label-md)] font-bold text-[var(--color-on-primary)]">
                        {agent_abbrev(preview.source)}
                    </span>
                    <div className="preview-text flex min-w-0 flex-1 flex-col gap-0.5">
                        <span className="preview-title truncate text-[length:var(--text-title-sm)] font-semibold text-[var(--color-on-surface)]">
                            {preview.title ?? preview.id}
                        </span>
                        <span className="preview-meta truncate whitespace-nowrap font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                            {agent_slug(preview.source)} · {String(preview.calls)} 轮 ·{" "}
                            {format_tokens(session_tokens(preview))} tokens ·{" "}
                            {relative_date(preview.ended_at)}
                        </span>
                    </div>
                    <button
                        type="button"
                        className="preview-close flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-lg text-[var(--color-on-surface-muted)] hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                        aria-label="关闭预览"
                        onClick={() => {
                            on_close();
                        }}
                    >
                        ×
                    </button>
                </div>
                <div className="preview-path shrink-0 truncate border-b border-[var(--color-hairline)] px-4 py-2 font-code-md text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                    {preview.directory ?? "—"}
                </div>
                <div className="preview-messages flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-4 py-2.5">
                    {preview_msgs.length === 0 ? (
                        <div className="preview-empty text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                            无消息预览
                        </div>
                    ) : (
                        preview_msgs.map((m) => (
                            <div className="preview-message" key={m.id}>
                                <span className="preview-role mb-0.5 block text-[length:var(--text-label-md)] font-semibold text-[var(--color-on-surface-variant)]">
                                    {m.role === "user" ? "用户" : "Agent"}
                                </span>
                                <MarkdownMessage text={m.text} />
                            </div>
                        ))
                    )}
                </div>
                <div className="preview-footer flex shrink-0 justify-end gap-2 border-t border-[var(--color-hairline)] px-4 py-3">
                    <Button
                        variant="secondary"
                        onClick={() => {
                            on_open(preview);
                        }}
                    >
                        单独打开
                    </Button>
                    <Button
                        variant="primary"
                        onClick={() => {
                            on_toggle_select(preview);
                        }}
                    >
                        加入选择
                    </Button>
                </div>
            </div>
        </div>
    );
}

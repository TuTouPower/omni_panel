import { memo, type CSSProperties } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { resume_command } from "../../lib/session-resume";
import { format_precise_datetime, last_dir_segment } from "../../lib/workspace/pane";
import { agent_accent, vendor_id_for_source } from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";
import { VendorMark } from "../Icon";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import { format_tokens, session_tokens } from "./session-library-utils";

interface CardProps {
    readonly s: TokenStatsSession;
    readonly selected: boolean;
    readonly on_toggle: (s: TokenStatsSession) => void;
    readonly on_preview: (s: TokenStatsSession) => void;
    readonly on_open: (s: TokenStatsSession) => void;
    /** 复制续接命令成功后提示（复用 SessionLibrary 的 show_toast）。 */
    readonly show_toast?: ((message: string) => void) | undefined;
    /** 测试用渲染计数回调。 */
    readonly onRender?: () => void;
}

/**
 * t326 会话库卡片：三行重排（cwd 末级+精确时间 / 轮次·tokens·session id / 会话名），
 * 徽标由 agent 字母缩写换 VendorMark provider logo，session id 点击复制续接命令。
 */
export const SessionCard = memo(function SessionCard({
    s,
    selected,
    on_toggle,
    on_preview,
    on_open,
    show_toast,
    onRender,
}: CardProps) {
    onRender?.();
    const session_command = resume_command(s.source, s.id);

    function copy_session_command(): void {
        if (session_command === null) return;
        // web 非安全上下文（HTTP）无 clipboard API，同步 TypeError 需前置守卫。
        if (typeof navigator.clipboard === "undefined") return;
        void navigator.clipboard
            .writeText(session_command)
            .then(() => {
                show_toast?.("已复制");
            })
            .catch(() => {
                // 忽略剪贴板拒绝。
            });
    }

    return (
        <Card
            raised
            className={cn(
                "library-card group relative flex min-w-0 flex-col overflow-hidden p-0 transition-shadow hover:shadow-[var(--shadow-card)]",
                selected && "ring-1 ring-[var(--agent-accent)]",
            )}
            style={{ "--agent-accent": agent_accent(s.source) } as CSSProperties}
        >
            <div className="library-card-accent h-0.5 shrink-0 bg-[var(--agent-accent)]" />
            <div className="library-card-body min-w-0 p-3">
                <div className="library-card-head flex min-w-0 items-center gap-2">
                    <span className="library-card-badge flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-[var(--agent-accent)]">
                        <VendorMark id={vendor_id_for_source(s.source)} size={20} />
                    </span>
                    <div className="library-card-text flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="library-card-top flex min-w-0 items-center gap-1 whitespace-nowrap text-[length:var(--text-label-md)]">
                            {s.directory ? (
                                <>
                                    <span
                                        className="library-card-cwd min-w-0 truncate text-[var(--color-on-surface-variant)]"
                                        title={s.directory}
                                    >
                                        {last_dir_segment(s.directory)}
                                    </span>
                                    <span className="shrink-0 text-[var(--color-on-surface-muted)]">
                                        ·
                                    </span>
                                </>
                            ) : null}
                            <span className="library-card-time shrink-0 font-code-md tabular-nums text-[var(--color-on-surface-muted)]">
                                {format_precise_datetime(s.ended_at)}
                            </span>
                        </div>
                        <div className="library-card-meta flex min-w-0 items-center gap-1 truncate whitespace-nowrap font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                            <span className="shrink-0">{String(s.calls)} 轮</span>
                            <span className="shrink-0">
                                {` · ${format_tokens(session_tokens(s))} tokens`}
                            </span>
                            <span className="shrink-0"> · </span>
                            <button
                                type="button"
                                className="library-card-session-id min-w-0 cursor-pointer truncate rounded border-0 bg-transparent p-0 text-left hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                                title={session_command ?? undefined}
                                onClick={copy_session_command}
                            >
                                {s.id}
                            </button>
                        </div>
                        <div className="library-card-title min-w-0 truncate text-[11px] font-semibold text-[var(--color-on-surface)]">
                            {s.title ?? s.id}
                        </div>
                    </div>
                </div>
            </div>
            <div className="library-card-actions flex gap-1.5 px-3 pb-2.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                        on_open(s);
                    }}
                >
                    单独打开
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    aria-label="预览"
                    onClick={() => {
                        on_preview(s);
                    }}
                >
                    预览
                </Button>
            </div>
            <button
                type="button"
                className={cn(
                    "library-card-select absolute right-2 top-2 flex h-[22px] w-[22px] items-center justify-center rounded-md border text-[length:var(--text-label-md)] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                    selected
                        ? "border-[var(--agent-accent)] bg-[var(--agent-accent)] text-[var(--color-on-primary)]"
                        : "border-[var(--color-on-surface-variant)] bg-transparent text-transparent hover:border-[var(--agent-accent)]",
                )}
                aria-label={`会话 ${s.id}`}
                aria-pressed={selected}
                onClick={() => {
                    on_toggle(s);
                }}
            >
                {selected ? "✓" : ""}
            </button>
        </Card>
    );
});

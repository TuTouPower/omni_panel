import { memo, type CSSProperties } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_accent } from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Card } from "../ui/Card";
import {
    agent_abbrev,
    format_tokens,
    relative_date,
    session_tokens,
} from "./session-library-utils";

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
        <Card
            className={cn(
                "library-card group relative flex min-w-0 flex-col overflow-hidden p-0 transition-shadow hover:shadow-[var(--shadow-card)]",
                selected && "ring-1 ring-[var(--agent-accent)]",
            )}
            style={{ "--agent-accent": agent_accent(s.source) } as CSSProperties}
        >
            <div className="library-card-accent h-0.5 shrink-0 bg-[var(--agent-accent)]" />
            <div className="library-card-body min-w-0 p-3">
                <div className="library-card-head flex min-w-0 items-center gap-2">
                    <span className="library-card-badge flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--agent-accent)] text-[9px] font-bold text-[var(--color-on-primary)]">
                        {agent_abbrev(s.source)}
                    </span>
                    <span className="library-card-title min-w-0 truncate text-[11px] font-semibold text-[var(--color-on-surface)]">
                        {s.title ?? s.id}
                    </span>
                </div>
                <div className="library-card-summary mt-1.5 line-clamp-2 text-[length:var(--text-body-md)] leading-[1.5] text-[var(--color-on-surface-variant)]">
                    {summary}
                </div>
                <div className="library-card-meta mt-1 font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                    {String(s.calls)} 轮 · {format_tokens(session_tokens(s))} tokens ·{" "}
                    {relative_date(s.ended_at)}
                </div>
                <div className="library-card-dir mt-0.5 truncate text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]">
                    {s.directory ?? "—"}
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

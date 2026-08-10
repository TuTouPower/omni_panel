import { memo, type CSSProperties } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_accent } from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
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
    readonly on_toggle: (s: TokenStatsSession) => void;
    readonly on_preview: (s: TokenStatsSession) => void;
    readonly on_open: (s: TokenStatsSession) => void;
}

export const SessionRow = memo(function SessionRow({
    s,
    summary,
    selected,
    on_toggle,
    on_preview,
    on_open,
}: RowProps) {
    return (
        <div
            className={cn(
                "library-row flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-[var(--color-surface-raised)]",
                selected && "bg-[var(--color-primary-container)]",
            )}
            style={{ "--agent-accent": agent_accent(s.source) } as CSSProperties}
        >
            <button
                type="button"
                className={cn(
                    "library-row-select flex h-5 w-5 shrink-0 items-center justify-center rounded-md border text-label-md font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
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
            <span className="library-row-badge flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--agent-accent)] text-[9px] font-bold text-[var(--color-on-primary)]">
                {agent_abbrev(s.source)}
            </span>
            <span className="library-row-title min-w-0 flex-1 truncate text-body-md font-medium text-[var(--color-on-surface)]">
                {s.title ?? s.id}
            </span>
            <span className="library-row-summary max-w-[200px] min-w-0 truncate text-label-md text-[var(--color-on-surface-variant)]">
                {summary}
            </span>
            <span className="library-row-meta shrink-0 whitespace-nowrap font-code-md text-label-md tabular-nums text-[var(--color-on-surface-muted)]">
                {String(s.calls)} 轮 · {format_tokens(session_tokens(s))} tokens ·{" "}
                {relative_date(s.ended_at)}
            </span>
            <span className="library-row-dir max-w-[160px] min-w-0 shrink truncate text-label-md text-[var(--color-on-surface-muted)]">
                {s.directory ?? "—"}
            </span>
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
    );
});

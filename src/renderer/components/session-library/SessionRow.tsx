import { memo, type CSSProperties } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_accent } from "../../lib/workspace/slots";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Checkbox } from "../ui/Checkbox";
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
                "flex min-w-0 items-center gap-2.5 rounded-lg bg-[var(--color-surface-card)] px-2.5 py-2 transition-colors hover:bg-[var(--color-surface-raised)]",
                selected && "bg-[var(--color-primary-container)]",
            )}
            data-testid="library-row"
            data-session-id={s.id}
            style={{ "--agent-accent": agent_accent(s.source) } as CSSProperties}
        >
            <Checkbox
                variant="select"
                accent="agent"
                boxSize="md"
                checked={selected}
                aria-label={`会话 ${s.id}`}
                onClick={() => {
                    on_toggle(s);
                }}
            />
            <span
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[var(--agent-accent)] text-[length:var(--text-label-caps)] font-bold text-[var(--color-on-primary)]"
                data-testid="library-row-badge"
            >
                {agent_abbrev(s.source)}
            </span>
            <span
                className="min-w-0 flex-1 truncate text-[length:var(--text-body-md)] font-[550] text-[var(--color-on-surface)]"
                data-testid="library-row-title"
            >
                {s.title ?? s.id}
            </span>
            <span
                className="max-w-[200px] min-w-0 truncate text-[length:var(--text-label-md)] text-[var(--color-on-surface-variant)]"
                data-testid="library-row-summary"
            >
                {summary}
            </span>
            <span
                className="shrink-0 whitespace-nowrap font-code-md text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]"
                data-testid="library-row-meta"
            >
                {String(s.calls)} 轮 · {format_tokens(session_tokens(s))} tokens ·{" "}
                {relative_date(s.ended_at)}
            </span>
            <span
                className="max-w-[160px] min-w-0 shrink truncate text-[length:var(--text-label-md)] text-[var(--color-on-surface-muted)]"
                data-testid="library-row-dir"
            >
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

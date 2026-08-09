import type { CSSProperties } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_accent } from "../../lib/workspace/slots";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import { agent_abbrev, key_of } from "./session-library-utils";

interface SelectionDockProps {
    readonly selected: readonly TokenStatsSession[];
    readonly max_select: number;
    readonly on_remove: (s: TokenStatsSession) => void;
    readonly on_clear: () => void;
    readonly on_open_all: (sessions: readonly TokenStatsSession[]) => void;
}

export function SelectionDock({
    selected,
    max_select,
    on_remove,
    on_clear,
    on_open_all,
}: SelectionDockProps) {
    if (selected.length === 0) return null;
    return (
        <div className="selection-dock sticky bottom-0 z-20 flex shrink-0 items-center gap-2.5 border-t border-[var(--color-outline)] bg-[color-mix(in_srgb,var(--color-surface-window)_94%,transparent)] px-4 py-2.5 backdrop-blur-[14px]">
            <div className="selection-dock-slots flex min-w-0 flex-1 gap-1.5 overflow-x-auto">
                {selected.map((s) => (
                    <span
                        className="selection-dock-slot inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--color-outline)] bg-[var(--color-surface-raised)] px-2 py-1 text-label-md text-[var(--color-on-surface-variant)]"
                        style={{ "--agent-accent": agent_accent(s.source) } as CSSProperties}
                        key={key_of(s)}
                        title={s.title ?? s.id}
                    >
                        <span className="text-[var(--agent-accent)]">{agent_abbrev(s.source)}</span>{" "}
                        · {s.title ?? s.id}
                        <button
                            type="button"
                            className="selection-dock-remove flex h-4 w-4 items-center justify-center rounded text-[var(--color-on-surface-muted)] hover:bg-[var(--color-primary-container)] hover:text-[var(--color-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                            aria-label={`移除 ${key_of(s)}`}
                            onClick={() => {
                                on_remove(s);
                            }}
                        >
                            ×
                        </button>
                    </span>
                ))}
            </div>
            <span className="selection-dock-count shrink-0 font-code-md text-label-md tabular-nums text-[var(--color-on-surface-muted)]">
                {String(selected.length)}/{String(max_select)}
            </span>
            <Button
                variant="secondary"
                size="sm"
                className="selection-dock-clear"
                onClick={on_clear}
            >
                清空
            </Button>
            <Button
                variant="primary"
                size="sm"
                className={cn("selection-dock-open shrink-0")}
                onClick={() => {
                    on_open_all(selected);
                }}
            >
                并排打开 ({String(selected.length)})
            </Button>
        </div>
    );
}

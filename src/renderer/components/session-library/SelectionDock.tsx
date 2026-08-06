import type { TokenStatsSession } from "../../../shared/types/token-stats";
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
        <div className="lib-dock">
            <div className="lib-dock-slots">
                {selected.map((s) => (
                    <span className="lib-dock-slot" key={key_of(s)} title={s.title ?? s.id}>
                        {agent_abbrev(s.source)} · {s.title ?? s.id}
                        <button
                            type="button"
                            className="lib-dock-remove"
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
            <span className="lib-dock-count">
                {String(selected.length)}/{String(max_select)}
            </span>
            <button type="button" className="lib-dock-clear" onClick={on_clear}>
                清空
            </button>
            <button
                type="button"
                className="lib-dock-open"
                onClick={() => {
                    on_open_all(selected);
                }}
            >
                并排打开 ({String(selected.length)})
            </button>
        </div>
    );
}

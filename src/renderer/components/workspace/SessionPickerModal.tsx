import { useCallback, useEffect, useMemo, useState } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_friendly, agent_slug, format_date } from "../../lib/session-history/markdown";
import { format_tokens } from "../../lib/workspace/slots";

interface SessionPickerModalProps {
    readonly target_index: number;
    readonly open_session_ids: ReadonlySet<string>;
    readonly on_pick: (sess: TokenStatsSession, index: number) => void;
    readonly on_close: () => void;
}

const PICKER_LIMIT = 500;

/** t224 会话选择弹窗：搜索（标题/路径）+ agent 筛选页签（带计数）+ 会话行列表。 */
export function SessionPickerModal({
    target_index,
    open_session_ids,
    on_pick,
    on_close,
}: SessionPickerModalProps) {
    const [sessions, set_sessions] = useState<TokenStatsSession[]>([]);
    const [search, set_search] = useState("");
    const [agent, set_agent] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void window.usageboard.tokenStats
            .getSessions({ limit: PICKER_LIMIT })
            .then((list) => {
                if (!cancelled) set_sessions(list);
            })
            .catch(() => {
                // 拉取失败：空列表，搜索无结果。
            });
        return () => {
            cancelled = true;
        };
    }, []);

    const sources = useMemo(() => {
        const counts = new Map<string, number>();
        for (const s of sessions) {
            counts.set(s.source, (counts.get(s.source) ?? 0) + 1);
        }
        return [...counts.entries()].sort((a, b) => b[1] - a[1]);
    }, [sessions]);

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return sessions.filter((s) => {
            if (agent !== null && s.source !== agent) return false;
            if (q === "") return true;
            return (
                (s.title ?? "").toLowerCase().includes(q) ||
                (s.directory ?? "").toLowerCase().includes(q) ||
                s.id.toLowerCase().includes(q)
            );
        });
    }, [sessions, search, agent]);

    const open = useCallback(
        (sess: TokenStatsSession): void => {
            on_pick(sess, target_index);
        },
        [on_pick, target_index],
    );

    return (
        <div className="ws-modal-scrim" onClick={on_close}>
            <div
                className="ws-modal"
                role="dialog"
                aria-label="选择会话"
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <div className="ws-modal-head">
                    <span className="ws-modal-title">选择会话装入槽位 {target_index + 1}</span>
                    <button
                        type="button"
                        className="ws-modal-close"
                        aria-label="关闭"
                        onClick={on_close}
                    >
                        ×
                    </button>
                </div>
                <div className="ws-picker-body">
                    <input
                        className="ws-picker-search"
                        placeholder="搜索标题 / 路径 / 会话 ID"
                        value={search}
                        onChange={(e) => {
                            set_search(e.target.value);
                        }}
                    />
                    <div className="ws-picker-agents">
                        <button
                            type="button"
                            className={"ws-picker-agent" + (agent === null ? " on" : "")}
                            onClick={() => {
                                set_agent(null);
                            }}
                        >
                            全部 {String(sessions.length)}
                        </button>
                        {sources.map(([source, count]) => (
                            <button
                                type="button"
                                key={source}
                                className={"ws-picker-agent" + (agent === source ? " on" : "")}
                                onClick={() => {
                                    set_agent(source);
                                }}
                            >
                                {agent_friendly(source)} {String(count)}
                            </button>
                        ))}
                    </div>
                    <div className="ws-picker-list">
                        {filtered.length === 0 ? (
                            <div className="ws-picker-empty">没有匹配的会话</div>
                        ) : (
                            filtered.map((s) => (
                                <button
                                    type="button"
                                    key={`${s.source}|${s.env}|${s.id}`}
                                    className="ws-picker-row"
                                    onClick={() => {
                                        open(s);
                                    }}
                                >
                                    <span className="ws-picker-title">
                                        {s.title ?? s.id}
                                        {open_session_ids.has(s.id) && (
                                            <span className="ws-picker-open">已打开</span>
                                        )}
                                    </span>
                                    <span className="ws-picker-meta">
                                        <span className="ws-picker-agent">
                                            {agent_slug(s.source)}
                                        </span>
                                        <span className="ws-picker-dir">{s.directory ?? "—"}</span>
                                        <span className="ws-picker-date">
                                            {format_date(s.ended_at)}
                                        </span>
                                        <span className="ws-picker-tokens">
                                            {format_tokens(
                                                s.input_tokens +
                                                    s.output_tokens +
                                                    s.cache_read_tokens +
                                                    s.cache_write_tokens,
                                            )}
                                        </span>
                                    </span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_friendly, agent_slug, format_date } from "../../lib/session-history/markdown";
import { format_tokens } from "../../lib/workspace/slots";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";
import { Input } from "../ui/Input";

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
        <Dialog
            open
            onClose={on_close}
            width={420}
            ariaLabel="选择会话"
            title={
                <div className="session-modal-title flex items-center justify-between gap-2">
                    <span>选择会话装入槽位 {target_index + 1}</span>
                    <Button
                        variant="icon"
                        size="sm"
                        className="!h-7 !w-7 !p-0 text-[length:var(--text-title-sm)]"
                        aria-label="关闭"
                        onClick={on_close}
                    >
                        ×
                    </Button>
                </div>
            }
        >
            <div className="session-picker-body flex max-h-[calc(76vh-110px)] min-h-0 flex-col gap-2.5">
                <Input
                    className="session-picker-search"
                    placeholder="搜索标题 / 路径 / 会话 ID"
                    value={search}
                    onChange={(e) => {
                        set_search(e.target.value);
                    }}
                />
                <div className="session-picker-filters flex flex-wrap gap-1.5">
                    <Button
                        variant={agent === null ? "primary" : "secondary"}
                        size="sm"
                        className="session-picker-filter !h-7 !rounded-full !px-2.5"
                        onClick={() => {
                            set_agent(null);
                        }}
                    >
                        全部 {String(sessions.length)}
                    </Button>
                    {sources.map(([source, count]) => (
                        <Button
                            variant={agent === source ? "primary" : "secondary"}
                            size="sm"
                            className="session-picker-filter !h-7 !rounded-full !px-2.5"
                            key={source}
                            onClick={() => {
                                set_agent(source);
                            }}
                        >
                            {agent_friendly(source)} {String(count)}
                        </Button>
                    ))}
                </div>
                <div className="session-picker-list flex min-h-[200px] max-h-[46vh] min-w-0 flex-col gap-1 overflow-y-auto">
                    {filtered.length === 0 ? (
                        <div className="session-picker-empty px-4 py-8 text-center text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                            没有匹配的会话
                        </div>
                    ) : (
                        filtered.map((s) => (
                            <button
                                type="button"
                                key={`${s.source}|${s.env}|${s.id}`}
                                className="session-picker-row flex min-w-0 flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--color-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]"
                                onClick={() => {
                                    open(s);
                                }}
                            >
                                <span className="session-picker-row-title flex min-w-0 items-center gap-2 truncate text-[length:var(--text-body-md)] font-medium text-[var(--color-on-surface)]">
                                    <span className="min-w-0 truncate">{s.title ?? s.id}</span>
                                    {open_session_ids.has(s.id) && (
                                        <span className="session-picker-open shrink-0 rounded-full bg-[var(--color-primary-container)] px-1.5 py-px text-[length:var(--text-label-caps)] font-semibold text-[var(--color-primary)]">
                                            已打开
                                        </span>
                                    )}
                                </span>
                                <span className="session-picker-meta flex min-w-0 items-center gap-2.5 text-[length:var(--text-label-md)] tabular-nums text-[var(--color-on-surface-muted)]">
                                    <span className="session-picker-source shrink-0">
                                        {agent_slug(s.source)}
                                    </span>
                                    <span className="session-picker-dir min-w-0 truncate">
                                        {s.directory ?? "—"}
                                    </span>
                                    <span className="session-picker-date shrink-0">
                                        {format_date(s.ended_at)}
                                    </span>
                                    <span className="session-picker-tokens ml-auto shrink-0">
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
        </Dialog>
    );
}

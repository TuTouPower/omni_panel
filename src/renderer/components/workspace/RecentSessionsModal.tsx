import { useEffect, useState } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_slug, format_date } from "../../lib/session-history/markdown";

interface RecentSessionsModalProps {
    readonly on_confirm: (sessions: TokenStatsSession[]) => void;
    readonly on_close: () => void;
}

const RECENT_LIMIT = 100;
const MAX_PICK = 8;

/** t224 最近会话弹窗：按日期倒序多选（上限 8，选择顺序角标），快捷「最近 2/4/8」。 */
export function RecentSessionsModal({ on_confirm, on_close }: RecentSessionsModalProps) {
    const [sessions, set_sessions] = useState<TokenStatsSession[]>([]);
    const [picked, set_picked] = useState<TokenStatsSession[]>([]);

    useEffect(() => {
        let cancelled = false;
        void window.usageboard.tokenStats
            .getSessions({ limit: RECENT_LIMIT })
            .then((list) => {
                if (!cancelled) {
                    const sorted = [...list].sort((a, b) => b.ended_at - a.ended_at);
                    set_sessions(sorted);
                }
            })
            .catch(() => {
                // 拉取失败：空列表。
            });
        return () => {
            cancelled = true;
        };
    }, []);

    function toggle(sess: TokenStatsSession): void {
        set_picked((prev) => {
            if (prev.some((s) => s.id === sess.id)) {
                return prev.filter((s) => s.id !== sess.id);
            }
            if (prev.length >= MAX_PICK) return prev;
            return [...prev, sess];
        });
    }

    function pick_first_n(n: number): void {
        set_picked(sessions.slice(0, n));
    }

    return (
        <div className="ws-modal-scrim" onClick={on_close}>
            <div
                className="ws-modal"
                role="dialog"
                aria-label="最近会话"
                onClick={(e) => {
                    e.stopPropagation();
                }}
            >
                <div className="ws-modal-head">
                    <span className="ws-modal-title">
                        最近会话（选 {String(picked.length)}/{String(MAX_PICK)}）
                    </span>
                    <button
                        type="button"
                        className="ws-modal-close"
                        aria-label="关闭"
                        onClick={on_close}
                    >
                        ×
                    </button>
                </div>
                <div className="ws-recent-body">
                    <div className="ws-recent-quick">
                        <span className="ws-recent-quick-label">快捷选择：</span>
                        {[2, 4, 8].map((n) => (
                            <button
                                type="button"
                                key={String(n)}
                                className="ws-recent-quick-btn"
                                onClick={() => {
                                    pick_first_n(n);
                                }}
                            >
                                最近 {String(n)} 个
                            </button>
                        ))}
                    </div>
                    <div className="ws-recent-list">
                        {sessions.length === 0 ? (
                            <div className="ws-recent-empty">暂无会话记录</div>
                        ) : (
                            sessions.map((s) => {
                                const order = picked.findIndex((p) => p.id === s.id);
                                const is_picked = order !== -1;
                                return (
                                    <button
                                        type="button"
                                        key={`${s.source}|${s.env}|${s.id}`}
                                        className={"ws-recent-row" + (is_picked ? " picked" : "")}
                                        onClick={() => {
                                            toggle(s);
                                        }}
                                    >
                                        <span
                                            className={"ws-recent-check" + (is_picked ? " on" : "")}
                                        >
                                            {is_picked ? String(order + 1) : ""}
                                        </span>
                                        <span className="ws-recent-title">{s.title ?? s.id}</span>
                                        <span className="ws-recent-meta">
                                            {agent_slug(s.source)} · {format_date(s.ended_at)}
                                        </span>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
                <div className="ws-modal-foot">
                    <button type="button" className="ws-modal-btn ghost" onClick={on_close}>
                        取消
                    </button>
                    <button
                        type="button"
                        className="ws-modal-btn primary"
                        disabled={picked.length === 0 || picked.length > MAX_PICK}
                        onClick={() => {
                            on_confirm(picked);
                        }}
                    >
                        清空并替换全部槽位
                    </button>
                </div>
            </div>
        </div>
    );
}

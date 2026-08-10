import { useEffect, useState } from "react";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { agent_slug, format_date } from "../../lib/session-history/markdown";
import { cn } from "../../lib/utils";
import { Button } from "../ui/Button";
import { Dialog } from "../ui/Dialog";

interface RecentSessionsModalProps {
    readonly on_confirm: (sessions: TokenStatsSession[]) => void;
    readonly on_close: () => void;
}

const RECENT_LIMIT = 100;
const MAX_PICK = 8;

/** t224 最近会话弹窗：按日期倒序多选（上限 8，选择顺序角标），快捷「最近 2/4/6/8」。 */
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
        <Dialog
            open
            onClose={on_close}
            width={420}
            ariaLabel="最近会话"
            title={
                <div className="history-modal-title flex items-center justify-between gap-2">
                    <span>
                        最近会话（选 {String(picked.length)}/{String(MAX_PICK)}）
                    </span>
                    <Button
                        variant="icon"
                        size="sm"
                        className="!h-7 !w-7 !p-0 text-title-sm"
                        aria-label="关闭"
                        onClick={on_close}
                    >
                        ×
                    </Button>
                </div>
            }
            footer={
                <>
                    <Button variant="ghost" onClick={on_close}>
                        取消
                    </Button>
                    <Button
                        variant="primary"
                        disabled={picked.length === 0 || picked.length > MAX_PICK}
                        onClick={() => {
                            on_confirm(picked);
                        }}
                    >
                        清空并替换全部槽位
                    </Button>
                </>
            }
        >
            <div className="history-recent-body flex min-h-0 flex-col gap-2.5">
                <div className="history-recent-quick flex flex-wrap items-center gap-1.5">
                    <span className="history-recent-quick-label mr-0.5 text-body-sm text-[var(--color-on-surface-muted)]">
                        快捷选择：
                    </span>
                    {[2, 4, 6, 8].map((n) => (
                        <Button
                            variant="secondary"
                            size="sm"
                            className="history-recent-quick-button !h-7 !px-2.5"
                            key={String(n)}
                            onClick={() => {
                                pick_first_n(n);
                            }}
                        >
                            最近 {String(n)} 个
                        </Button>
                    ))}
                </div>
                <div className="history-recent-list flex max-h-[46vh] min-h-0 flex-col gap-1 overflow-y-auto">
                    {sessions.length === 0 ? (
                        <div className="history-recent-empty px-4 py-8 text-center text-body-md text-[var(--color-on-surface-muted)]">
                            暂无会话记录
                        </div>
                    ) : (
                        sessions.map((s) => {
                            const order = picked.findIndex((p) => p.id === s.id);
                            const is_picked = order !== -1;
                            return (
                                <button
                                    type="button"
                                    key={`${s.source}|${s.env}|${s.id}`}
                                    className={cn(
                                        "history-recent-row flex items-center gap-2.5 rounded-lg border border-transparent px-2.5 py-2 text-left hover:bg-[var(--color-surface-raised)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                                        is_picked &&
                                            "picked border-[color-mix(in_srgb,var(--color-primary)_45%,transparent)] bg-[var(--color-primary-container)]",
                                    )}
                                    aria-pressed={is_picked}
                                    onClick={() => {
                                        toggle(s);
                                    }}
                                >
                                    <span
                                        className={cn(
                                            "history-recent-check flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-[1.5px] border-[var(--color-on-surface-variant)] text-label-caps font-bold text-[var(--color-on-primary)]",
                                            is_picked &&
                                                "on border-[var(--color-primary)] bg-[var(--color-primary)]",
                                        )}
                                    >
                                        {is_picked ? String(order + 1) : ""}
                                    </span>
                                    <span className="history-recent-title min-w-0 flex-1 truncate text-body-md font-medium text-[var(--color-on-surface)]">
                                        {s.title ?? s.id}
                                    </span>
                                    <span className="history-recent-meta shrink-0 text-label-md tabular-nums text-[var(--color-on-surface-muted)]">
                                        {agent_slug(s.source)} · {format_date(s.ended_at)}
                                    </span>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </Dialog>
    );
}

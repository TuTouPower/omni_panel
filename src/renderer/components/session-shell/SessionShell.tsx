import { useCallback, useEffect, useRef, useState } from "react";
import type { SessionHistoryLoc } from "../../../shared/types/ipc";
import type { TokenStatsSession } from "../../../shared/types/token-stats";
import { PanelTitleBar } from "../ui/PanelTitleBar";
import { Toast } from "../ui/Toast";
import { useTheme } from "../../lib/theme";
import { use_panel_navigation } from "../../lib/panel-navigation";
import { cn } from "../../lib/utils";
import { SessionLibrary } from "../session-library/SessionLibrary";
import { CompareView } from "../session-compare/CompareView";
import { key_of } from "../session-library/session-library-utils";
import { clear_saved_workspace } from "../../lib/workspace/workspace-storage";
import { initial_loc } from "../workspace/workspace-view-helpers";

type ShellPage = "library" | "compare";

const MAX_COMPARE = 8;

/** 从外部 open/focus 定位构造最小会话桩，Compare 面板会再补消息。 */
function session_stub_from_loc(loc: SessionHistoryLoc): TokenStatsSession {
    return {
        id: loc.session_id,
        source: loc.source as TokenStatsSession["source"],
        env: loc.env as TokenStatsSession["env"],
        model: "",
        title: null,
        directory: null,
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        calls: 0,
        started_at: Date.now(),
        ended_at: Date.now(),
    };
}

/** 外部定位补全会话元信息：按 source/env + id 子串查库，精确命中则替换桩头；查无/失败返回 null（保留桩）。 */
async function resolve_session_from_loc(loc: SessionHistoryLoc): Promise<TokenStatsSession | null> {
    try {
        const rows = await window.usageboard.tokenStats.getSessions({
            source: loc.source,
            env: loc.env,
            search: loc.session_id,
            limit: 10,
            offset: 0,
        });
        return rows.find((s) => s.id === loc.session_id && s.env === loc.env) ?? null;
    } catch {
        return null;
    }
}

/**
 * 会话窗口外壳（P6）：默认会话库；同屏查看进入 compare。
 * 不再暴露「工作台」页签；外部 open/focus 亦进入同屏查看。
 */
export function SessionShell() {
    const [page, set_page] = useState<ShellPage>("library");
    const [compare_sessions, set_compare_sessions] = useState<TokenStatsSession[]>([]);
    const [refresh_token, set_refresh_token] = useState(0);
    const [toast, set_toast] = useState<string | null>(null);

    useTheme();
    const navigate = use_panel_navigation();

    const show_toast = useCallback((message: string): void => {
        set_toast(message);
        window.setTimeout(() => {
            set_toast(null);
        }, 2500);
    }, []);

    const open_compare = useCallback((sessions: readonly TokenStatsSession[]): void => {
        const capped = sessions.slice(0, MAX_COMPARE);
        set_compare_sessions([...capped]);
        set_page("compare");
    }, []);

    const open_compare_from_loc = useCallback(
        (loc: SessionHistoryLoc): void => {
            const k = `${loc.source}|${loc.env}|${loc.session_id}`;
            if (compare_sessions.some((s) => key_of(s) === k)) {
                set_page("compare");
                return;
            }
            if (compare_sessions.length >= MAX_COMPARE) {
                show_toast("已达同屏上限 8 条");
                set_page("compare");
                return;
            }
            // 先挂桩即时进页，再异步补全元信息（头信息不再显示 Date.now 桩时间）。
            set_compare_sessions((prev) =>
                prev.some((s) => key_of(s) === k)
                    ? prev
                    : [...prev, session_stub_from_loc(loc)].slice(0, MAX_COMPARE),
            );
            set_page("compare");
            void resolve_session_from_loc(loc).then((full) => {
                if (full) {
                    set_compare_sessions((prev) => prev.map((s) => (key_of(s) === k ? full : s)));
                }
            });
        },
        [compare_sessions, show_toast],
    );

    // P6：工作台已下线，清理残留的工作台持久化孤儿键（只执行一次）。
    useEffect(() => {
        clear_saved_workspace();
    }, []);

    // 外部打开会话 / URL loc → 同屏查看（替代原工作台装槽）。
    // initial 只处理一次：回调随 compare_sessions 变化重建，effect 重跑时不再重复进入。
    const initial_handled_ref = useRef(false);
    useEffect(() => {
        const off = window.usageboard.sessionHistory.onFocus((loc) => {
            open_compare_from_loc(loc);
        });
        if (!initial_handled_ref.current) {
            initial_handled_ref.current = true;
            const initial = initial_loc();
            if (initial) open_compare_from_loc(initial);
        }
        return off;
    }, [open_compare_from_loc]);

    const open_recent_global = useCallback(
        async (n: number): Promise<void> => {
            try {
                const recent = await window.usageboard.tokenStats.getSessions({
                    order_by: "ended_at",
                    direction: "desc",
                    limit: n,
                    offset: 0,
                });
                if (recent.length === 0) {
                    show_toast("没有可同屏打开的会话");
                    return;
                }
                open_compare(recent);
            } catch {
                show_toast("会话列表加载失败");
            }
        },
        [open_compare, show_toast],
    );

    return (
        <div
            className="flex h-screen min-h-screen flex-col bg-[var(--color-surface-window)] text-[var(--color-on-surface)]"
            data-testid="session-shell"
        >
            <header
                className="relative flex shrink-0 items-center border-b border-[var(--color-hairline)] bg-[var(--color-surface-window)]"
                data-testid="session-topbar"
            >
                <PanelTitleBar
                    panel="Session"
                    className="min-w-0 flex-1"
                    onNavigate={navigate}
                    onRefresh={() => {
                        void window.usageboard.tokenStats.forceCollect().catch(() => undefined);
                        set_refresh_token((k) => k + 1);
                    }}
                />
            </header>
            <main className="flex min-h-0 flex-1" data-testid="session-body">
                <section
                    className={cn("min-w-0 flex-1", page !== "library" && "hidden")}
                    data-pane="library"
                    data-active={page === "library"}
                    aria-hidden={page !== "library"}
                >
                    <SessionLibrary on_open_compare={open_compare} refresh_token={refresh_token} />
                </section>
                <section
                    className={cn("min-w-0 flex-1", page !== "compare" && "hidden")}
                    data-pane="compare"
                    data-active={page === "compare"}
                    aria-hidden={page !== "compare"}
                >
                    <CompareView
                        sessions={compare_sessions}
                        refresh_token={refresh_token}
                        on_back={() => {
                            set_page("library");
                        }}
                        on_remove={(session) => {
                            set_compare_sessions((prev) =>
                                prev.filter((s) => key_of(s) !== key_of(session)),
                            );
                        }}
                        on_open_recent={(n) => {
                            void open_recent_global(n);
                        }}
                        on_show_toast={show_toast}
                    />
                </section>
            </main>
            {toast !== null && <Toast>{toast}</Toast>}
        </div>
    );
}

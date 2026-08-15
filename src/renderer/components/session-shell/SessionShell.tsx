import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PanelTitleBar } from "../ui/PanelTitleBar";
import { useTheme } from "../../lib/theme";
import { use_panel_navigation } from "../../lib/panel-navigation";
import { cn } from "../../lib/utils";
import { WorkspaceView } from "../workspace/WorkspaceView";
import { WorkspaceToolbar } from "../workspace/WorkspaceToolbar";
import { SessionLibrary } from "../session-library/SessionLibrary";
import type { LayoutCount } from "../../lib/workspace/slots";
import { load_saved_layout, save_layout } from "../../lib/workspace/workspace-storage";
import type { PaneView } from "../workspace/SessionPane";

type ShellTab = "workspace" | "library";

/** 会话窗口单壳双页签外壳：顶栏承载页签/面板跳转。 */
export function SessionShell() {
    const [tab, set_tab] = useState<ShellTab>("workspace");
    // 标题栏刷新按钮递增 token，触发工作台槽位消息立即重拉。
    const [refresh_token, set_refresh_token] = useState(0);
    // t323：三按钮状态提升到外壳，WorkspaceView 受控；rail-toggle 折叠状态同步上移。
    // t329：布局/视图开关持久化——首次渲染从 localStorage 恢复。
    const saved_layout = useMemo(() => load_saved_layout(), []);
    const [layout, set_layout] = useState<LayoutCount>(saved_layout?.layout ?? 3);
    const [view, set_view] = useState<PaneView>(
        saved_layout?.view ?? { show_time: false, compact: false },
    );
    const [recent_open, set_recent_open] = useState(false);
    const [rail_collapsed, set_rail_collapsed] = useState(false);
    // WorkspaceView 经 on_count_change 上报占用槽位数，供视图下拉排布。
    const [count, set_count] = useState(0);
    // 清空动作作用于槽位模型，状态在 WorkspaceView 内部，由其上抛注册。
    const clear_workspace_ref = useRef<(() => void) | null>(null);
    const register_clear = useCallback((fn: (() => void) | null): void => {
        clear_workspace_ref.current = fn;
    }, []);

    // t329: 布局/视图变化即持久化（重开恢复）。
    useEffect(() => {
        save_layout(layout, view);
    }, [layout, view]);

    useTheme();
    const navigate = use_panel_navigation();

    return (
        <div className="session-shell flex h-screen min-h-screen flex-col bg-[var(--color-surface-window)] text-[var(--color-on-surface)]">
            <header className="session-topbar relative flex shrink-0 items-center border-b border-[var(--color-hairline)] bg-[var(--color-surface-window)]">
                <PanelTitleBar
                    panel="Session"
                    className="min-w-0 flex-1"
                    onNavigate={navigate}
                    onRefresh={() => {
                        set_refresh_token((k) => k + 1);
                    }}
                    before_actions={
                        <WorkspaceToolbar
                            layout={layout}
                            count={count}
                            view={view}
                            on_view_change={set_view}
                            on_layout_change={set_layout}
                            on_recent={() => {
                                set_recent_open(true);
                            }}
                            on_clear={() => {
                                clear_workspace_ref.current?.();
                            }}
                        />
                    }
                    center={
                        <nav className="flex h-full items-stretch gap-1" aria-label="面板页签">
                            <button
                                type="button"
                                className={cn(
                                    "session-tab border-b-2 border-transparent px-4 text-[length:var(--text-body-md)] text-[var(--color-on-surface-variant)] transition-colors hover:text-[var(--color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                                    tab === "workspace" &&
                                        "active border-[var(--color-primary)] text-[var(--color-on-surface)]",
                                )}
                                data-active={tab === "workspace"}
                                aria-selected={tab === "workspace"}
                                onClick={() => {
                                    set_tab("workspace");
                                }}
                            >
                                工作台
                            </button>
                            <button
                                type="button"
                                className={cn(
                                    "session-tab border-b-2 border-transparent px-4 text-[length:var(--text-body-md)] text-[var(--color-on-surface-variant)] transition-colors hover:text-[var(--color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                                    tab === "library" &&
                                        "active border-[var(--color-primary)] text-[var(--color-on-surface)]",
                                )}
                                data-active={tab === "library"}
                                aria-selected={tab === "library"}
                                onClick={() => {
                                    set_tab("library");
                                }}
                            >
                                会话库
                            </button>
                        </nav>
                    }
                />
            </header>
            {/* t380 AC-004: rail-toggle 下移为标题栏下方独立行，不再占用标题栏左侧 220px */}
            <div className="session-rail-toggle-row flex shrink-0 items-stretch border-b border-[var(--color-hairline)] bg-[var(--color-surface-window)]">
                <button
                    type="button"
                    className={cn(
                        "session-rail-toggle h-8 w-[220px] shrink-0 border-r border-[var(--color-outline)] bg-[var(--color-surface-window)] text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)] transition-[width] duration-200 hover:bg-[var(--color-surface-raised)] hover:text-[var(--color-on-surface-variant)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
                        rail_collapsed && "w-11",
                    )}
                    title={rail_collapsed ? "展开槽位栏" : "折叠槽位栏"}
                    aria-label={rail_collapsed ? "展开槽位栏" : "折叠槽位栏"}
                    onClick={() => {
                        set_rail_collapsed((v) => !v);
                    }}
                >
                    {rail_collapsed ? "»" : "«"}
                </button>
            </div>
            <main className="session-body flex min-h-0 flex-1">
                <section
                    className={cn("session-panel min-w-0 flex-1", tab !== "workspace" && "hidden")}
                    data-pane="workspace"
                    data-active={tab === "workspace"}
                    aria-hidden={tab !== "workspace"}
                >
                    <WorkspaceView
                        refresh_token={refresh_token}
                        layout={layout}
                        view={view}
                        recent_open={recent_open}
                        rail_collapsed={rail_collapsed}
                        on_layout_change={set_layout}
                        on_recent={() => {
                            set_recent_open(true);
                        }}
                        on_recent_close={() => {
                            set_recent_open(false);
                        }}
                        on_count_change={set_count}
                        on_register_clear={register_clear}
                    />
                </section>
                <section
                    className={cn("session-panel min-w-0 flex-1", tab !== "library" && "hidden")}
                    data-pane="library"
                    data-active={tab === "library"}
                    aria-hidden={tab !== "library"}
                >
                    <SessionLibrary
                        on_switch_workspace={() => {
                            set_tab("workspace");
                        }}
                    />
                </section>
            </main>
        </div>
    );
}

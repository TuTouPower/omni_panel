import { useState } from "react";
import { PanelTitleBar } from "../PanelTitleBar";
import { useTheme } from "../../lib/theme";
import { use_panel_navigation } from "../../lib/panel-navigation";
import { cn } from "../../lib/utils";
import { WorkspaceView } from "../workspace/WorkspaceView";
import { SessionLibrary } from "../session-library/SessionLibrary";

type ShellTab = "workspace" | "library";

/** 会话窗口单壳双页签外壳：顶栏承载页签/面板跳转。 */
export function SessionShell() {
    const [tab, set_tab] = useState<ShellTab>("workspace");
    // 标题栏刷新按钮递增 token，触发工作台槽位消息立即重拉。
    const [refresh_token, set_refresh_token] = useState(0);
    useTheme();
    const navigate = use_panel_navigation();

    return (
        <div className="history-shell flex h-screen min-h-screen flex-col bg-[var(--color-surface)] text-[var(--color-on-surface)]">
            <header className="history-topbar flex shrink-0 items-center gap-3 border-b border-[var(--color-hairline)] bg-[var(--color-surface)] px-3">
                <PanelTitleBar
                    panel="Session"
                    onNavigate={navigate}
                    onRefresh={() => {
                        set_refresh_token((k) => k + 1);
                    }}
                />
                <nav
                    className="history-tabs ml-auto mr-auto flex h-full items-stretch gap-1"
                    aria-label="面板页签"
                >
                    <button
                        type="button"
                        className={cn(
                            "history-tab h-full border-b-2 border-transparent px-4 text-body-md text-[var(--color-on-surface-variant)] transition-colors hover:text-[var(--color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
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
                            "history-tab h-full border-b-2 border-transparent px-4 text-body-md text-[var(--color-on-surface-variant)] transition-colors hover:text-[var(--color-on-surface)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent-ring)]",
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
            </header>
            <main className="history-body flex min-h-0 flex-1">
                <section
                    className={cn("history-panel min-w-0 flex-1", tab !== "workspace" && "hidden")}
                    data-pane="workspace"
                    data-active={tab === "workspace"}
                    aria-hidden={tab !== "workspace"}
                >
                    <WorkspaceView refresh_token={refresh_token} />
                </section>
                <section
                    className={cn("history-panel min-w-0 flex-1", tab !== "library" && "hidden")}
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

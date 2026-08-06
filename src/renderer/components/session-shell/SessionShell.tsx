import { useState } from "react";
import logo_svg from "../../assets/logo.svg";
import { Icon } from "../Icon";
import { useSessionShellTheme } from "../../lib/session-shell/theme";
import { WorkspaceView } from "../workspace/WorkspaceView";
import "../../styles/session-shell.css";

type ShellTab = "workspace" | "library";

/** 会话窗口单壳双页签外壳（t223）：顶栏承载页签/主题切换/面板跳转。
 *  两个页签面板均保持挂载，切换只改 CSS 显隐，不丢各页内部状态。 */
export function SessionShell() {
    const [tab, set_tab] = useState<ShellTab>("workspace");
    const { theme, toggle_theme } = useSessionShellTheme();

    return (
        <div className="session-shell">
            <header className="shell-topbar">
                <div className="shell-brand">
                    <img className="shell-logo" src={logo_svg} alt="OmniPanel" />
                    <span className="shell-title">OmniPanel</span>
                </div>
                <nav className="shell-tabs" aria-label="面板页签">
                    <button
                        type="button"
                        className={"shell-tab" + (tab === "workspace" ? " on" : "")}
                        aria-selected={tab === "workspace"}
                        onClick={() => {
                            set_tab("workspace");
                        }}
                    >
                        工作台
                    </button>
                    <button
                        type="button"
                        className={"shell-tab" + (tab === "library" ? " on" : "")}
                        aria-selected={tab === "library"}
                        onClick={() => {
                            set_tab("library");
                        }}
                    >
                        会话库
                    </button>
                </nav>
                <div className="shell-actions">
                    <button
                        type="button"
                        className="shell-action"
                        data-testid="shell-open-usage"
                        title="用量面板"
                        aria-label="用量面板"
                        onClick={() => {
                            window.usageboard.tray.open_panel();
                        }}
                    >
                        <Icon name="clock_forward" size={15} />
                    </button>
                    <button
                        type="button"
                        className="shell-action"
                        data-testid="shell-open-token"
                        title="代理面板"
                        aria-label="代理面板"
                        onClick={() => {
                            window.usageboard.tokenStats.open();
                        }}
                    >
                        <Icon name="chart" size={15} />
                    </button>
                    <button
                        type="button"
                        className="shell-action"
                        title={theme === "dark" ? "切换到浅色模式" : "切换到暗色模式"}
                        aria-label={theme === "dark" ? "切换到浅色模式" : "切换到暗色模式"}
                        onClick={toggle_theme}
                    >
                        <Icon name={theme === "dark" ? "sun" : "moon"} size={15} />
                    </button>
                </div>
            </header>
            <main className="shell-body">
                <section
                    className="shell-pane"
                    data-pane="workspace"
                    data-active={tab === "workspace"}
                    aria-hidden={tab !== "workspace"}
                >
                    <WorkspaceView />
                </section>
                <section
                    className="shell-pane shell-library"
                    data-pane="library"
                    data-active={tab === "library"}
                    aria-hidden={tab !== "library"}
                >
                    <div className="shell-library-empty">
                        <span className="shell-library-icon">
                            <Icon name="layers" size={40} />
                        </span>
                        <p className="shell-library-title">会话库</p>
                        <p className="shell-library-sub">搜索、筛选与浏览历史会话，即将上线</p>
                    </div>
                </section>
            </main>
        </div>
    );
}

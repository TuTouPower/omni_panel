import { useState } from "react";
import logo_svg from "../../assets/logo.svg";
import { Icon } from "../Icon";
import { useTheme } from "../../lib/theme";
import { WorkspaceView } from "../workspace/WorkspaceView";
import { SessionLibrary } from "../session-library/SessionLibrary";
import "../../styles/session-shell.css";
import "../../styles/session-library.css";

type ShellTab = "workspace" | "library";

/** 会话窗口单壳双页签外壳（t223）：顶栏承载页签/面板跳转。
 *  两个页签面板均保持挂载，切换只改 CSS 显隐，不丢各页内部状态。 */
export function SessionShell() {
    const [tab, set_tab] = useState<ShellTab>("workspace");
    useTheme();

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

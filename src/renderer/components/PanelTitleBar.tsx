import { Icon } from "./Icon";
import { is_web } from "../lib/is-web";
import logo from "../assets/logo.svg";

export type PanelName = "Usage" | "Agent" | "Session" | "Settings";

interface PanelTitleBarProps {
    /** 当前面板名（品牌标题 `Omni Panel - <name>`）。 */
    panel: PanelName;
    /** 是否正在刷新（旋转动画）。 */
    refreshing?: boolean;
    /** 刷新当前面板。 */
    onRefresh?: () => void;
    /** 面板切换（当前面板对应图标隐藏）。 */
    onNavigate?: (panel: PanelName) => void;
    /** 刷新按钮仅 live 模式可用。 */
    is_live?: boolean;
    /** 覆盖关闭行为（用量面板关闭=隐藏到托盘，AC3）。缺省 window.close。 */
    onClose?: () => void;
}

/** t252 四面板统一标题栏：品牌区 + 自绘控制区（刷新/面板切换/最小化/最大化/关闭）。
 *  web 模式窗口控制 no-op（usageboard-web window_methods 空实现）。 */
export function PanelTitleBar({
    panel,
    refreshing = false,
    onRefresh,
    onNavigate,
    is_live = true,
    onClose,
}: PanelTitleBarProps) {
    const panels: PanelName[] = ["Usage", "Agent", "Session", "Settings"];
    return (
        <div className="panel-titlebar" data-panel-titlebar={panel}>
            <img src={logo} alt="OmniPanel" className="app-logo" width="24" height="24" />
            <span className="app-title">{`Omni Panel - ${panel}`}</span>
            <div className="panel-titlebar-actions">
                {onRefresh && (
                    <button
                        className={"icon-btn" + (refreshing ? " spinning" : "")}
                        title="刷新当前面板"
                        aria-label="刷新"
                        onClick={is_live ? onRefresh : undefined}
                    >
                        <Icon name="refresh" size={16} />
                    </button>
                )}
                {panels
                    .filter((p) => p !== panel)
                    .map((p) => (
                        <button
                            key={p}
                            className="icon-btn"
                            title={`${p}面板`}
                            aria-label={`${p}面板`}
                            onClick={() => onNavigate?.(p)}
                        >
                            {p === "Usage" && <Icon name="dashboard" size={16} />}
                            {p === "Agent" && <Icon name="chart" size={16} />}
                            {p === "Session" && <Icon name="chat_square" size={16} />}
                            {p === "Settings" && <Icon name="gear" size={16} />}
                        </button>
                    ))}
                {!is_web() && (
                    <>
                        <button
                            className="icon-btn"
                            title="最小化"
                            aria-label="最小化"
                            onClick={() => {
                                window.usageboard.window.minimize();
                            }}
                        >
                            <Icon name="minus" size={16} />
                        </button>
                        <button
                            className="icon-btn"
                            title="最大化/还原"
                            aria-label="最大化/还原"
                            onClick={() => {
                                window.usageboard.window.maximize();
                            }}
                        >
                            <Icon name="maximize" size={16} />
                        </button>
                        <button
                            className="icon-btn"
                            title="关闭"
                            aria-label="关闭"
                            onClick={
                                onClose ??
                                (() => {
                                    window.usageboard.window.close();
                                })
                            }
                        >
                            <Icon name="close" size={16} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

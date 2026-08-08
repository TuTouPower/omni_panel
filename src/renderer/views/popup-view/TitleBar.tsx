import { Icon } from "../../components/Icon";
import { is_web } from "../../lib/is-web";
import logo from "../../assets/logo.svg";

interface TitleBarProps {
    footerTime: string | null;
    refreshing: boolean;
    is_live: boolean;
    titlebar_class: string;
    onRefreshAll: () => void;
    onOpenSettings: () => void;
    is_floating: boolean;
    onHidePanel: () => void;
    /** 打开/聚焦会话历史窗口（t212；web 模式隐藏按钮）。 */
    onOpenHistory?: () => void;
}

export function TitleBar(props: TitleBarProps) {
    const {
        footerTime,
        refreshing,
        is_live,
        titlebar_class,
        onRefreshAll,
        onOpenSettings,
        is_floating,
        onHidePanel,
        onOpenHistory,
    } = props;
    return (
        <div className={titlebar_class}>
            <img
                src={logo}
                alt="OmniPanel"
                className="app-logo"
                width="30"
                height="30"
                style={{ borderRadius: 9 }}
            />
            <span className="app-title">Omni Panel - Usage</span>
            <div className="tb-actions">
                {footerTime && (
                    <span className="tb-time" title="上次更新时间">
                        {footerTime}
                    </span>
                )}
                <button
                    className={"icon-btn" + (refreshing ? " spinning" : "")}
                    title="刷新全部"
                    aria-label="刷新"
                    onClick={is_live ? onRefreshAll : undefined}
                >
                    <Icon name="refresh" size={18} />
                </button>
                <button
                    className="icon-btn"
                    title="设置"
                    onClick={is_live ? onOpenSettings : undefined}
                >
                    <Icon name="gear" size={18} />
                </button>
                <button
                    className="icon-btn"
                    title="代理面板"
                    aria-label="代理面板"
                    onClick={() => {
                        window.usageboard.tokenStats.open();
                    }}
                >
                    <Icon name="chart" size={18} />
                </button>
                {!is_web() && (
                    <button
                        className="icon-btn"
                        title="会话历史"
                        aria-label="会话历史"
                        onClick={is_live ? onOpenHistory : undefined}
                    >
                        <Icon name="chat_square" size={18} />
                    </button>
                )}
                {is_live && is_floating && (
                    <button
                        className="icon-btn floating-close-btn"
                        title="隐藏到托盘"
                        aria-label="隐藏用量面板"
                        type="button"
                        onClick={onHidePanel}
                    >
                        <Icon name="close" size={18} />
                    </button>
                )}
                {!is_web() && !is_floating && (
                    <>
                        <button
                            className="icon-btn"
                            title="最小化"
                            aria-label="最小化"
                            onClick={() => {
                                window.usageboard.window.minimize();
                            }}
                        >
                            <Icon name="minus" size={18} />
                        </button>
                        <button
                            className="icon-btn"
                            title="最大化/还原"
                            aria-label="最大化/还原"
                            onClick={() => {
                                window.usageboard.window.maximize();
                            }}
                        >
                            <Icon name="maximize" size={18} />
                        </button>
                        <button
                            className="icon-btn"
                            title="关闭"
                            aria-label="关闭"
                            onClick={() => {
                                // t252 AC3: 用量面板关闭 = 隐藏到托盘（保留渲染进程与数据，
                                // 非销毁窗口）。
                                onHidePanel();
                            }}
                        >
                            <Icon name="close" size={18} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

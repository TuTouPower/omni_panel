import { Icon } from "../../components/Icon";
import { is_web } from "../../lib/is-web";
import { Button } from "../../components/ui/Button";
import logo from "../../assets/logo.svg";

interface TitleBarProps {
    footerTime: string | null;
    refreshing: boolean;
    is_live: boolean;
    /** Phase 20.5: macOS popup 锚定托盘不可拖拽；Win/Linux 可拖。 */
    no_drag: boolean;
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
        no_drag,
        onRefreshAll,
        onOpenSettings,
        is_floating,
        onHidePanel,
        onOpenHistory,
    } = props;
    return (
        <div
            className={
                "flex shrink-0 items-center gap-2.5 px-4 pb-3 pt-3.5 " +
                (no_drag ? "[-webkit-app-region:no-drag]" : "[-webkit-app-region:drag]")
            }
            data-testid="popup-titlebar"
        >
            <img
                src={logo}
                alt="OmniPanel"
                className="block h-[30px] w-[30px] shrink-0 object-contain drop-shadow-[0_3px_7px_rgba(61,122,253,0.26)]"
                width="30"
                height="30"
                style={{ borderRadius: 9 }}
            />
            <span
                className="text-title-md font-bold tracking-[-0.01em] text-[var(--color-on-surface)]"
                data-testid="app-title"
            >
                Omni Panel - Usage
            </span>
            <div className="ml-auto flex items-center gap-0.5 [-webkit-app-region:no-drag]">
                {footerTime && (
                    <span
                        className="mr-1 whitespace-nowrap text-[12px] text-[var(--color-on-surface-muted)]"
                        title="上次更新时间"
                        data-testid="popup-time"
                    >
                        {footerTime}
                    </span>
                )}
                <Button
                    className="h-8 w-8 p-0"
                    variant="icon"
                    size="sm"
                    title="刷新全部"
                    aria-label="刷新"
                    onClick={is_live ? onRefreshAll : undefined}
                >
                    <Icon
                        name="refresh"
                        size={18}
                        {...(refreshing ? { className: "animate-spin" } : {})}
                    />
                </Button>
                <Button
                    variant="icon"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="设置"
                    onClick={is_live ? onOpenSettings : undefined}
                >
                    <Icon name="gear" size={18} />
                </Button>
                <Button
                    variant="icon"
                    size="sm"
                    className="h-8 w-8 p-0"
                    title="代理面板"
                    aria-label="代理面板"
                    onClick={() => {
                        window.usageboard.tokenStats.open();
                    }}
                >
                    <Icon name="chart" size={18} />
                </Button>
                {!is_web() && (
                    <Button
                        variant="icon"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="会话历史"
                        aria-label="会话历史"
                        onClick={is_live ? onOpenHistory : undefined}
                    >
                        <Icon name="chat_square" size={18} />
                    </Button>
                )}
                {is_live && is_floating && (
                    <Button
                        variant="icon"
                        size="sm"
                        className="h-8 w-8 p-0"
                        title="隐藏到托盘"
                        aria-label="隐藏用量面板"
                        type="button"
                        onClick={onHidePanel}
                    >
                        <Icon name="close" size={18} />
                    </Button>
                )}
                {!is_web() && !is_floating && (
                    <>
                        <Button
                            variant="icon"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="最小化"
                            aria-label="最小化"
                            onClick={() => {
                                window.usageboard.window.minimize();
                            }}
                        >
                            <Icon name="minus" size={18} />
                        </Button>
                        <Button
                            variant="icon"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="最大化/还原"
                            aria-label="最大化/还原"
                            onClick={() => {
                                window.usageboard.window.maximize();
                            }}
                        >
                            <Icon name="maximize" size={18} />
                        </Button>
                        <Button
                            variant="icon"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="关闭"
                            aria-label="关闭"
                            onClick={() => {
                                // t252 AC3: 用量面板关闭 = 隐藏到托盘（保留渲染进程与数据，
                                // 非销毁窗口）。
                                onHidePanel();
                            }}
                        >
                            <Icon name="close" size={18} />
                        </Button>
                    </>
                )}
            </div>
        </div>
    );
}

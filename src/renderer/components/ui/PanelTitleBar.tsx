import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { Icon } from "../Icon";
import { is_web } from "../../lib/is-web";
import type { PanelName } from "../../lib/panel-navigation";
import logo from "../../assets/logo.svg";
import { Button } from "./Button";
import { ICON_LINK_CLS } from "./icon-link";

interface PanelTitleBarProps {
    /** 通用形态：标题内容（与 panel 形态二选一）。 */
    title?: ReactNode;
    /** 通用形态：右侧动作区（关闭/最小化等）。 */
    actions?: ReactNode;
    /** 面板形态：刷新按钮左侧的前置动作区（t323 会话工作台三按钮）。 */
    before_actions?: ReactNode;
    className?: string;
    "data-panel-titlebar"?: string;
    /** 面板形态：当前面板名（品牌标题 `Omni Panel - <name>`）。 */
    panel?: PanelName;
    /** 面板形态：是否正在刷新（旋转动画）。 */
    refreshing?: boolean;
    /** 面板形态：刷新当前面板。 */
    onRefresh?: () => void;
    /** 面板形态：面板切换（当前面板对应图标隐藏）。 */
    onNavigate?: (panel: PanelName) => void;
    /** 面板形态：刷新按钮仅 live 模式可用。 */
    is_live?: boolean;
    /** 面板形态：覆盖关闭行为（用量面板关闭=隐藏到托盘，AC3）。缺省 window.close。 */
    onClose?: () => void;
}

/**
 * 窗口控制按钮组（最小化/最大化/关闭），面板形态与通用形态共用。
 * Web 构建不渲染（无窗口 API）。
 */
export function WindowControls({ onClose }: { onClose?: (() => void) | undefined }): ReactNode {
    if (is_web()) return null;
    return (
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
                <Icon name="minus" size={16} />
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
                <Icon name="maximize" size={16} />
            </Button>
            <Button
                variant="icon"
                size="sm"
                className="h-8 w-8 p-0"
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
            </Button>
        </>
    );
}

/**
 * t269 统一 PanelTitleBar（DESIGN.md panel-titlebar，高 44px）。
 * 通用形态 = title/actions；t252 面板形态 = panel/onNavigate/onRefresh（品牌区 + 面板切换 +
 * 窗口控制），四面板（Settings/Session/Agent）共用，避免重复实现。
 */
export function PanelTitleBar({
    title,
    actions,
    before_actions,
    className,
    "data-panel-titlebar": dataPanelTitlebar,
    panel,
    refreshing = false,
    onRefresh,
    onNavigate,
    is_live = true,
    onClose,
}: PanelTitleBarProps) {
    const panels: PanelName[] = ["Settings", "Usage", "Agent", "Session"];
    // t311：web 端互跳入口为原生 `<a href="#{route}">`（中键/Ctrl+Click 由浏览器新开标签页），
    // 桌面端保持 Button + onNavigate。路由名映射与 use-route.ts VALID_ROUTES / App.tsx 挂载一致。
    const panel_routes: Record<PanelName, string> = {
        Settings: "setting",
        Usage: "usage",
        Agent: "agent",
        Session: "session",
    };
    const base = cn(
        "flex h-11 shrink-0 items-center justify-between gap-2 border-b " +
            "border-[var(--color-hairline)] bg-[var(--color-surface-window)] " +
            "px-[var(--spacing-panel-padding)] text-[length:var(--text-body-md)] text-[var(--color-on-surface)] " +
            "[-webkit-app-region:drag]",
        className,
    );
    const actions_cls = "[-webkit-app-region:no-drag] flex items-center gap-1";

    if (panel !== undefined) {
        return (
            <div className={base} data-panel-titlebar={dataPanelTitlebar ?? panel}>
                <div className="flex min-w-0 items-center gap-2">
                    <img
                        src={logo}
                        alt="OmniPanel"
                        className="h-6 w-6 shrink-0 object-contain drop-shadow-[0_3px_7px_rgba(61,122,253,0.26)]"
                    />
                    <span
                        className="truncate text-[length:var(--text-title-md)] font-bold tracking-[-0.01em]"
                        data-testid="app-title"
                    >
                        {`Omni Panel - ${panel}`}
                    </span>
                </div>
                <div className={actions_cls}>
                    {before_actions}
                    {onRefresh && panel !== "Settings" && (
                        <Button
                            variant="icon"
                            size="sm"
                            className="h-8 w-8 p-0"
                            title="刷新当前面板"
                            aria-label="刷新"
                            onClick={is_live ? onRefresh : undefined}
                        >
                            <Icon
                                name="refresh"
                                size={16}
                                {...(refreshing ? { className: "animate-spin" } : {})}
                            />
                        </Button>
                    )}
                    {panels
                        .filter((p) => p !== panel)
                        .map((p) => {
                            const icon = (
                                <>
                                    {p === "Usage" && <Icon name="clock_forward" size={16} />}
                                    {p === "Agent" && <Icon name="chart" size={16} />}
                                    {p === "Session" && <Icon name="chat_square" size={16} />}
                                    {p === "Settings" && <Icon name="gear" size={16} />}
                                </>
                            );
                            if (is_web()) {
                                return (
                                    <a
                                        key={p}
                                        className={ICON_LINK_CLS}
                                        title={`${p}面板`}
                                        aria-label={`${p}面板`}
                                        href={`#${panel_routes[p]}`}
                                    >
                                        {icon}
                                    </a>
                                );
                            }
                            return (
                                <Button
                                    key={p}
                                    variant="icon"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    title={`${p}面板`}
                                    aria-label={`${p}面板`}
                                    onClick={() => {
                                        onNavigate?.(p);
                                    }}
                                >
                                    {icon}
                                </Button>
                            );
                        })}
                    <WindowControls onClose={onClose} />
                </div>
            </div>
        );
    }

    return (
        <div className={base} data-panel-titlebar={dataPanelTitlebar}>
            <div className="truncate">{title}</div>
            {actions !== undefined && <div className={actions_cls}>{actions}</div>}
        </div>
    );
}

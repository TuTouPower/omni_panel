import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { use_config } from "../hooks/use-config";
import { useTheme } from "../lib/theme";
import { Icon } from "../components/Icon";
import { Menu, MenuItem } from "../components/ui/Menu";
import logo from "../assets/logo.svg";
import { useResizeObserver } from "../hooks/use-resize-observer";

interface TrayMenuItem {
    icon: string;
    label_zh: string;
    label_en: string;
    danger?: boolean;
    checked?: boolean;
    meta?: string;
    separator_before?: boolean;
    action: () => void;
}

const MODULE = "TrayMenu";

const get_app_version = (): string => {
    const m = /[?&]v=([^&]+)/.exec(window.location.hash);
    return m ? decodeURIComponent(m[1] ?? "") : "";
};

export function TrayMenu() {
    useTheme();

    const { config } = use_config();
    const menu_ref = useRef<HTMLDivElement | null>(null);
    const [is_paused, set_is_paused] = useState(false);
    const [is_autostart, set_is_autostart] = useState(false);
    const app_version = useMemo(() => get_app_version(), []);

    const is_zh = config?.language === "zh-Hans";

    useEffect(() => {
        const cleanup_pause = window.usageboard.tray.on_pause_state((paused) => {
            set_is_paused(paused);
        });
        const cleanup_autostart = window.usageboard.tray.on_autostart_state((enabled) => {
            set_is_autostart(enabled);
        });
        return () => {
            cleanup_pause();
            cleanup_autostart();
        };
    }, []);

    const t = useCallback(
        (label_zh: string, label_en: string) => (is_zh ? label_zh : label_en),
        [is_zh],
    );

    const items: TrayMenuItem[] = useMemo(
        () => [
            {
                icon: "open",
                label_zh: "用量面板",
                label_en: "Usage Panel",
                action: () => {
                    window.usageboard.tray.open_panel();
                },
            },
            {
                icon: "chart",
                label_zh: "代理面板",
                label_en: "Agent Panel",
                action: () => {
                    window.usageboard.tokenStats.open();
                },
            },
            {
                icon: "chat_square",
                label_zh: "会话面板",
                label_en: "Session Panel",
                action: () => {
                    void window.usageboard.sessionHistory.open("", "", "");
                },
            },
            {
                icon: "open",
                label_zh: "网页访问",
                label_en: "Web Panel",
                action: () => {
                    window.usageboard.tray.open_web();
                },
            },
            {
                icon: "refresh",
                label_zh: "立即刷新全部",
                label_en: "Refresh All",
                action: () => {
                    window.usageboard.tray.refresh_all();
                },
            },
            {
                icon: "pause",
                label_zh: is_paused ? "恢复自动刷新" : "暂停自动刷新",
                label_en: is_paused ? "Resume Auto-Refresh" : "Pause Auto-Refresh",
                checked: is_paused,
                separator_before: true,
                action: () => {
                    window.usageboard.tray.toggle_pause();
                },
            },
            {
                icon: "power",
                label_zh: "开机自启",
                label_en: "Launch at Login",
                checked: is_autostart,
                action: () => {
                    window.usageboard.tray.toggle_autostart();
                },
            },
            {
                icon: "gear",
                label_zh: "设置…",
                label_en: "Settings…",
                separator_before: true,
                action: () => {
                    window.usageboard.tray.open_settings();
                },
            },
            {
                icon: "download",
                label_zh: "检查更新",
                label_en: "Check for Updates",
                meta: app_version ? `v${app_version}` : "",
                action: () => {
                    window.usageboard.tray.check_update();
                },
            },
            {
                icon: "clipboard",
                label_zh: "问卷反馈",
                label_en: "Survey",
                action: () => {
                    window.usageboard.tray.survey();
                },
            },
            {
                icon: "heart",
                label_zh: "支持作者",
                label_en: "Sponsor",
                action: () => {
                    window.usageboard.tray.sponsor();
                },
            },
            {
                icon: "refresh",
                label_zh: "重启",
                label_en: "Restart",
                action: () => {
                    window.usageboard.tray.restart();
                },
            },
            {
                icon: "exit",
                label_zh: "退出 OmniPanel",
                label_en: "Quit OmniPanel",
                danger: true,
                separator_before: true,
                action: () => {
                    window.usageboard.tray.quit();
                },
            },
        ],
        [is_paused, is_autostart, app_version],
    );

    useEffect(() => {
        document.documentElement.setAttribute("data-window", "tray");
        return () => {
            document.documentElement.removeAttribute("data-window");
        };
    }, []);

    const report_menu_size = useCallback((): void => {
        const el = menu_ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        window.usageboard.tray.report_menu_size({
            width: Math.ceil(rect.width),
            height: Math.ceil(rect.height),
        });
    }, []);

    useResizeObserver(menu_ref, report_menu_size, [items]);

    return (
        <div
            className="w-max shrink-0 self-start overflow-hidden rounded-2xl border-[0.5px] border-[var(--color-outline)] bg-[var(--color-menu-bg)] py-2 shadow-menu backdrop-blur-[28px] backdrop-saturate-[1.7] motion-safe:animate-[ctxIn_0.18s_ease-out]"
            data-testid="tray-window"
            ref={menu_ref}
        >
            <div className="mb-0.5 flex items-center gap-2 border-b-[0.5px] border-b-[var(--color-hairline)] px-3.5 py-3 text-[13.5px] font-bold text-[var(--color-on-surface)]">
                <img
                    className="block h-6 w-6 shrink-0 object-contain drop-shadow-[0_3px_7px_rgba(61,122,253,0.26)]"
                    src={logo}
                    alt=""
                    width={24}
                    height={24}
                />
                <span>OmniPanel</span>
            </div>
            <div className="p-[7px]" data-testid="tray-menu-body">
                <Menu>
                    {items.map((item, i) => (
                        <div key={i}>
                            {item.separator_before && (
                                <div className="my-1 border-t border-[var(--color-hairline)]" />
                            )}
                            <MenuItem
                                danger={item.danger === true}
                                onSelect={() => {
                                    window.usageboard.log({
                                        level: "debug",
                                        module: MODULE,
                                        message: `tray action: ${item.icon}`,
                                    });
                                    item.action();
                                }}
                            >
                                <span className="flex w-4 items-center justify-center">
                                    <Icon name={item.icon} size={16} strokeWidth={1.7} />
                                </span>
                                <span>{t(item.label_zh, item.label_en)}</span>
                                {item.checked && (
                                    <span className="ml-auto flex items-center text-[var(--color-accent)]">
                                        <Icon name="check" size={15} strokeWidth={2.2} />
                                    </span>
                                )}
                                {item.meta && !item.checked && (
                                    <span className="ml-auto text-label-md text-[var(--color-on-surface-muted)] tabular-nums">
                                        {item.meta}
                                    </span>
                                )}
                            </MenuItem>
                        </div>
                    ))}
                </Menu>
            </div>
        </div>
    );
}

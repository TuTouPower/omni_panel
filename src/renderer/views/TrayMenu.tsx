import { useState, useEffect, useMemo, useCallback } from "react";
import { use_config } from "../hooks/use-config";
import { useTheme } from "../lib/theme";
import { Icon } from "../components/Icon";
import logo from "../assets/logo.png";

interface TrayMenuItem {
    icon: string;
    label_zh: string;
    label_en: string;
    danger?: boolean;
    checked?: boolean;
    meta?: string;
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
                label_zh: "打开主面板",
                label_en: "Open Panel",
                action: () => {
                    window.usageboard.tray.open_panel();
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
            // separator rendered by UI
            {
                icon: "pause",
                label_zh: is_paused ? "恢复自动刷新" : "暂停自动刷新",
                label_en: is_paused ? "Resume Auto-Refresh" : "Pause Auto-Refresh",
                checked: is_paused,
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
            // separator
            {
                icon: "gear",
                label_zh: "设置…",
                label_en: "Settings…",
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
            // separator
            {
                icon: "exit",
                label_zh: "退出 OmniUsage",
                label_en: "Quit OmniUsage",
                danger: true,
                action: () => {
                    window.usageboard.tray.quit();
                },
            },
        ],
        [is_paused, is_autostart, app_version],
    );

    const sep_indexes = new Set([2, 4, 6]); // indexes where separators appear

    return (
        <div className="tray-window">
            <div className="tray-win-head">
                <img className="app-logo sm" src={logo} alt="" width={24} height={24} />
                <span>OmniUsage</span>
            </div>
            <div className="tray-menu-body">
                {items.map((item, i) => (
                    <div key={i}>
                        {sep_indexes.has(i) && <div className="ctx-sep" />}
                        <div
                            className={`ctx-item${item.danger ? " danger" : ""}`}
                            onClick={() => {
                                window.usageboard.log({
                                    level: "debug",
                                    module: MODULE,
                                    message: `tray action: ${item.icon}`,
                                });
                                item.action();
                            }}
                        >
                            <span className="ci-ic">
                                <Icon name={item.icon} size={16} strokeWidth={1.7} />
                            </span>
                            <span>{t(item.label_zh, item.label_en)}</span>
                            {item.checked && (
                                <span className="ci-check">
                                    <Icon name="check" size={15} strokeWidth={2.2} />
                                </span>
                            )}
                            {item.meta && !item.checked && (
                                <span className="ci-meta">{item.meta}</span>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

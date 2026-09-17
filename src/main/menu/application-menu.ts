import { app, BrowserWindow, Menu, type MenuItemConstructorOptions } from "electron";
import { createLogger } from "../../shared/lib/logger";

const log = createLogger("app-menu");

export interface ApplicationMenuDeps {
    platform?: NodeJS.Platform | undefined;
    app_name?: string | undefined;
    on_close_window?: ((win: BrowserWindow) => void) | undefined;
    on_quit?: (() => void) | undefined;
    is_usage_window?: ((win: BrowserWindow) => boolean) | undefined;
    hide_usage_panel?: (() => void) | undefined;
}

/**
 * 构建应用菜单模板。
 * macOS 下提供标准菜单结构，含 ⌘W 分流（usage 隐藏 / 其它关闭）、⌘M、⌃⌘F、⌘H、⌘Q（AC-004）。
 * 非 macOS 返回空数组（保持系统/Electron 默认）。
 */
export function build_application_menu_template(
    deps: ApplicationMenuDeps = {},
): MenuItemConstructorOptions[] {
    const platform = deps.platform ?? process.platform;
    if (platform !== "darwin") {
        return [];
    }

    const app_name = deps.app_name ?? app.name;

    return [
        {
            label: app_name,
            submenu: [
                { role: "about", label: `About ${app_name}` },
                { type: "separator" },
                { role: "services" },
                { type: "separator" },
                { role: "hide", label: `Hide ${app_name}`, accelerator: "Cmd+H" },
                { role: "hideOthers", label: "Hide Others" },
                { role: "unhide", label: "Show All" },
                { type: "separator" },
                {
                    label: `Quit ${app_name}`,
                    accelerator: "Cmd+Q",
                    click: () => {
                        if (deps.on_quit) {
                            deps.on_quit();
                        } else {
                            app.quit();
                        }
                    },
                },
            ],
        },
        {
            role: "editMenu",
        },
        {
            label: "View",
            submenu: [
                {
                    label: "Toggle Full Screen",
                    accelerator: "Ctrl+Cmd+F",
                    role: "togglefullscreen",
                },
            ],
        },
        {
            label: "Window",
            submenu: [
                {
                    label: "Minimize",
                    accelerator: "Cmd+M",
                    role: "minimize",
                },
                {
                    label: "Close Window",
                    accelerator: "Cmd+W",
                    click: (_, focusedWindow) => {
                        const raw = focusedWindow ?? BrowserWindow.getFocusedWindow();
                        if (!raw || raw.isDestroyed()) return;
                        const target = raw as BrowserWindow;

                        if (deps.on_close_window) {
                            deps.on_close_window(target);
                            return;
                        }

                        const is_usage =
                            deps.is_usage_window?.(target) ??
                            target.getTitle() === "Omni Panel - Usage";

                        if (is_usage) {
                            if (deps.hide_usage_panel) {
                                deps.hide_usage_panel();
                            } else {
                                target.hide();
                            }
                        } else {
                            target.close();
                        }
                    },
                },
                { type: "separator" },
                { role: "front", label: "Bring All to Front" },
            ],
        },
    ];
}

/**
 * 安装 macOS 应用菜单。
 */
export function setup_application_menu(deps: ApplicationMenuDeps = {}): Menu | null {
    const platform = deps.platform ?? process.platform;
    if (platform !== "darwin") {
        return null;
    }

    try {
        const template = build_application_menu_template(deps);
        const menu = Menu.buildFromTemplate(template);
        Menu.setApplicationMenu(menu);
        log.info("Installed macOS application menu");
        return menu;
    } catch (err: unknown) {
        log.error(
            `Failed to setup application menu: ${err instanceof Error ? err.message : String(err)}`,
        );
        return null;
    }
}

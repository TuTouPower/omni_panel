import type { BrowserWindow } from "electron";
import type { PopupContentHeightReport } from "../../../shared/types/ipc";

export type MainPanelPlatform = "darwin" | "win32" | "linux";
export type MainPanelShellMode = "popup" | "floating";

export type WindowLike = Pick<
    BrowserWindow,
    | "close"
    | "destroy"
    | "focus"
    | "getBounds"
    | "hide"
    | "isDestroyed"
    // t539: 只读查询扩展（Space/失焦反转判定用），不加新行为。
    | "isFocused"
    | "isVisible"
    | "loadURL"
    | "on"
    | "setAlwaysOnTop"
    | "setBounds"
    | "setMinimumSize"
    | "setMaximumSize"
    | "setResizable"
    | "setSkipTaskbar"
    | "setVisibleOnAllWorkspaces"
    | "show"
    | "showInactive"
>;

export interface MainPanelController {
    open_or_toggle(): void;
    open_or_focus(): void;
    hide(): void;
    close_for_mode_switch(): void;
    apply_config_change(): void;
    report_content_height(report: PopupContentHeightReport): number | null;
    get_window(): WindowLike | null;
    get_mode(): MainPanelShellMode;
}

export type {
    MainPanelMode,
    FloatingHeightMode,
    FloatingBoundsConfiguration,
} from "../../../shared/types/config";

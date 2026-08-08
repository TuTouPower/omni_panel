import type { PanelName } from "../components/PanelTitleBar";

/** t252: 四面板互跳。桌面走各窗口 open（开/聚焦目标面板窗口）；
 *  web 端对应 open 方法内部已 hash 切页（usageboard-web）。 */
export function use_panel_navigation(): (panel: PanelName) => void {
    return (panel: PanelName) => {
        switch (panel) {
            case "Usage":
                window.usageboard.tray.open_panel();
                break;
            case "Agent":
                window.usageboard.tokenStats.open();
                break;
            case "Settings":
                window.usageboard.settings.open();
                break;
            case "Session":
                void window.usageboard.sessionHistory.open("", "", "");
                break;
        }
    };
}

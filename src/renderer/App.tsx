import { use_route } from "./hooks/use-route";
import { PopupView } from "./views/PopupView";
import { SessionHistoryView } from "./views/SessionHistoryView";
import { SettingsView } from "./views/SettingsView";
import { TrayMenu } from "./views/TrayMenu";
import { TokenStatsView } from "./views/TokenStatsView";

export function App() {
    const route = use_route();
    switch (route) {
        case "setting":
            return <SettingsView />;
        case "tray":
            return <TrayMenu />;
        case "agent":
            return <TokenStatsView />;
        case "history":
            return <SessionHistoryView />;
        default:
            return <PopupView />;
    }
}

import { use_route } from "./hooks/use-route";
import { SessionShell } from "./components/session-shell/SessionShell";
import { PopupView } from "./views/PopupView";
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
            return <SessionShell />;
        default:
            return <PopupView />;
    }
}

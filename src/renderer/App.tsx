import { use_route } from "./hooks/use-route";
import { PopupView } from "./views/PopupView";
import { SettingsView } from "./views/SettingsView";
import { TrayMenu } from "./views/TrayMenu";

export function App() {
    const route = use_route();
    switch (route) {
        case "settings":
            return <SettingsView />;
        case "tray":
            return <TrayMenu />;
        default:
            return <PopupView />;
    }
}

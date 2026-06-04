import { useRoute } from "./hooks/use-route";
import { PopupView } from "./views/PopupView";
import { SettingsView } from "./views/SettingsView";
import { TrayMenu } from "./views/TrayMenu";

export function App() {
    const route = useRoute();
    switch (route) {
        case "settings":
            return <SettingsView />;
        case "tray":
            return <TrayMenu />;
        default:
            return <PopupView />;
    }
}

import { useRoute } from "./hooks/use-route";
import { PopupView } from "./views/PopupView";
import { SettingsView } from "./views/SettingsView";

export function App() {
    const route = useRoute();
    switch (route) {
        case "settings":
            return <SettingsView />;
        default:
            return <PopupView />;
    }
}

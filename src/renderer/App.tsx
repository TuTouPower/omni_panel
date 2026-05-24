import { useRoute } from "./hooks/use-route";
import { PopupView } from "./views/PopupView";
import { DashboardView } from "./views/DashboardView";
import { SettingsView } from "./views/SettingsView";

export function App() {
    const route = useRoute();
    switch (route) {
        case "dashboard":
            return <DashboardView />;
        case "settings":
            return <SettingsView />;
        default:
            return <PopupView />;
    }
}

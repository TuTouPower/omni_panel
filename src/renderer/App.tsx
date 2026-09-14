import { Suspense, lazy } from "react";
import { use_route } from "./hooks/use-route";

const SessionShell = lazy(() =>
    import("./components/session-shell/SessionShell").then((m) => ({ default: m.SessionShell })),
);
const PopupView = lazy(() => import("./views/PopupView").then((m) => ({ default: m.PopupView })));
const SettingsView = lazy(() =>
    import("./views/SettingsView").then((m) => ({ default: m.SettingsView })),
);
const TrayMenu = lazy(() => import("./views/TrayMenu").then((m) => ({ default: m.TrayMenu })));
const TokenStatsView = lazy(() =>
    import("./views/TokenStatsView").then((m) => ({ default: m.TokenStatsView })),
);
const DevPanelView = lazy(() =>
    import("./views/DevPanelView").then((m) => ({ default: m.DevPanelView })),
);

export function App() {
    const route = use_route();
    let view;
    switch (route) {
        case "setting":
            view = <SettingsView />;
            break;
        case "tray":
            view = <TrayMenu />;
            break;
        case "agent":
            view = <TokenStatsView />;
            break;
        case "session":
            view = <SessionShell />;
            break;
        case "dev":
            view = <DevPanelView />;
            break;
        default:
            view = <PopupView />;
    }
    return <Suspense fallback={<RouteLoading />}>{view}</Suspense>;
}

function RouteLoading() {
    return (
        <div
            role="status"
            aria-label="页面加载中"
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
            }}
        >
            <span className="text-[length:var(--text-body-md)] text-[var(--color-on-surface-muted)]">
                加载中…
            </span>
        </div>
    );
}

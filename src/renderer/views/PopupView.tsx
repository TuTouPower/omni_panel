import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { PluginCard } from "../components/PluginCard";
import { ErrorBanner } from "../components/ErrorBanner";
import { EmptyState } from "../components/EmptyState";
import { RefreshButton } from "../components/RefreshButton";
import logo from "../assets/logo.png";

export function PopupView() {
    useTheme();
    const { plugins, loading, error, refreshAll } = usePlugins();

    return (
        <div className="flex h-screen flex-col">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                <h1 className="text-sm font-semibold flex items-center gap-1.5">
                    <img src={logo} alt="OmniUsage" className="h-4 w-4" />
                    OmniUsage
                </h1>
                <RefreshButton onClick={refreshAll} data-testid="popup-refresh-btn" />
            </header>

            <main className="flex-1 overflow-auto p-3">
                {error && (
                    <div data-testid="popup-error">
                        <ErrorBanner message={error} />
                    </div>
                )}
                {loading && plugins.length === 0 && (
                    <div className="grid grid-cols-1 gap-2">
                        <PluginCard
                            plugin={{
                                instanceId: "_skeleton",
                                stateId: "_skeleton",
                                name: "",
                                displayName: "",
                                enabled: true,
                                metadata: null,
                                snapshot: { status: "loading" },
                            }}
                        />
                    </div>
                )}
                {!loading && plugins.length === 0 && <EmptyState data-testid="popup-empty" />}
                <div className="grid grid-cols-1 gap-2">
                    {plugins.map((p) => (
                        <div key={p.instanceId} data-testid="popup-plugin-card">
                            <PluginCard plugin={p} />
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}

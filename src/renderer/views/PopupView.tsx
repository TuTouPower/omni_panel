import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { PluginCard } from "../components/PluginCard";
import { ErrorBanner } from "../components/ErrorBanner";
import { EmptyState } from "../components/EmptyState";
import { RefreshButton } from "../components/RefreshButton";

export function PopupView() {
    useTheme();
    const { plugins, loading, error, refreshAll } = usePlugins();

    return (
        <div className="flex h-screen flex-col">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                <h1 className="text-sm font-semibold">OmniUsage</h1>
                <RefreshButton onClick={refreshAll} />
            </header>

            <main className="flex-1 overflow-auto p-3">
                {error && <ErrorBanner message={error} />}
                {loading && plugins.length === 0 && (
                    <div className="grid grid-cols-1 gap-2">
                        <PluginCard
                            plugin={{
                                stateId: "_skeleton",
                                name: "",
                                enabled: true,
                                metadata: null,
                                snapshot: { status: "loading" },
                            }}
                        />
                    </div>
                )}
                {!loading && plugins.length === 0 && <EmptyState />}
                <div className="grid grid-cols-1 gap-2">
                    {plugins.map((p) => (
                        <PluginCard key={p.stateId} plugin={p} />
                    ))}
                </div>
            </main>
        </div>
    );
}

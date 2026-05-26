import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { PluginCard } from "../components/PluginCard";
import { ErrorBanner } from "../components/ErrorBanner";
import { EmptyState } from "../components/EmptyState";
import { RefreshButton } from "../components/RefreshButton";
import { Button } from "../components/Button";
import logo from "../assets/logo.png";

export function PopupView() {
    useTheme();
    const { plugins, loading, error, refreshAll } = usePlugins();

    const goToSettings = () => {
        window.location.hash = "#settings";
    };

    const emptyState = (() => {
        if (loading || plugins.length > 0) return null;

        const hasFailedKey = plugins.some(
            (p) =>
                p.snapshot.status === "failed" &&
                (p.snapshot.error.includes("key") || p.snapshot.error.includes("Key")),
        );
        if (hasFailedKey) {
            return (
                <EmptyState
                    message="部分插件缺少密钥配置"
                    action="前往设置"
                    onAction={goToSettings}
                    data-testid="popup-empty"
                />
            );
        }

        return (
            <EmptyState
                message="暂无插件，请在设置中配置"
                action="前往设置"
                onAction={goToSettings}
                data-testid="popup-empty"
            />
        );
    })();

    return (
        <div className="flex h-screen flex-col">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-4 py-2">
                <h1
                    className="text-sm font-semibold flex items-center gap-1.5"
                    data-testid="popup-title"
                >
                    <img src={logo} alt="OmniUsage" className="h-4 w-4" />
                    OmniUsage
                </h1>
                <div className="flex items-center gap-2">
                    <RefreshButton onClick={refreshAll} data-testid="popup-refresh-btn" />
                    <Button variant="ghost" size="sm" onClick={goToSettings}>
                        设置
                    </Button>
                </div>
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
                {emptyState}
                <div className="grid grid-cols-1 gap-2" data-testid="popup-plugin-list">
                    {plugins.map((p) => (
                        <div key={p.instanceId} data-testid={`popup-plugin-card-${p.instanceId}`}>
                            <PluginCard plugin={p} />
                        </div>
                    ))}
                </div>
            </main>
        </div>
    );
}

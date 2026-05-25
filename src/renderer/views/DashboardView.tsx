import { useState, useEffect } from "react";
import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { PluginCard } from "../components/PluginCard";
import { ErrorBanner } from "../components/ErrorBanner";
import { EmptyState } from "../components/EmptyState";
import { RefreshButton } from "../components/RefreshButton";
import { Button } from "../components/Button";
import type { PythonStatus } from "../../shared/types/ipc";
import logo from "../assets/logo.png";

export function DashboardView() {
    useTheme();
    const { plugins, loading, error, refreshAll } = usePlugins();
    const [pythonStatus, setPythonStatus] = useState<PythonStatus | null>(null);

    useEffect(() => {
        window.usageboard.system
            .getPythonStatus()
            .then(setPythonStatus)
            .catch(() => undefined);
    }, []);

    return (
        <div className="flex h-screen flex-col">
            <header className="flex items-center justify-between border-b border-[var(--border)] px-6 py-3">
                <h1 className="text-lg font-semibold flex items-center gap-2">
                    <img src={logo} alt="OmniUsage" className="h-6 w-6" />
                    OmniUsage Dashboard
                </h1>
                <div className="flex items-center gap-2">
                    <RefreshButton onClick={refreshAll} />
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                            window.location.hash = "#settings";
                        }}
                    >
                        设置
                    </Button>
                </div>
            </header>

            <main className="flex-1 overflow-auto p-6">
                {pythonStatus && !pythonStatus.available && (
                    <ErrorBanner message="未检测到 Python 3.8+，插件功能不可用。请安装 Python。" />
                )}
                {error && <ErrorBanner message={error} />}
                {loading && plugins.length === 0 && (
                    <div className="space-y-3">
                        <PluginCard
                            plugin={{
                                instanceId: "_skeleton",
                                stateId: "_skeleton",
                                name: "",
                                enabled: true,
                                metadata: null,
                                snapshot: { status: "loading" },
                            }}
                        />
                    </div>
                )}
                {!loading && plugins.length === 0 && (
                    <EmptyState message="暂无插件，请在设置中配置" />
                )}
                <div className="space-y-3">
                    {plugins.map((p) => (
                        <PluginCard key={p.instanceId} plugin={p} />
                    ))}
                </div>
            </main>
        </div>
    );
}

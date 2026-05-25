import { useConfig } from "../hooks/use-config";
import { usePlugins } from "../hooks/use-plugins";
import { useTheme } from "../lib/theme";
import { SettingsForm } from "../components/SettingsForm";
import { ErrorBanner } from "../components/ErrorBanner";
import logo from "../assets/logo.png";

export function SettingsView() {
    useTheme();
    const { config, hasSecrets, loading, error, save, saveSecrets, duplicate } = useConfig();
    const { plugins } = usePlugins();

    if (loading) {
        return <div className="p-6 text-[var(--muted-foreground)]">加载中...</div>;
    }
    if (error) {
        return (
            <div className="p-6">
                <ErrorBanner message={error} />
            </div>
        );
    }
    if (!config) return null;

    const metadataMap = new Map(plugins.map((p) => [p.instanceId, p.metadata]));

    const handleSave = async (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
    ) => {
        const updated = {
            ...config,
            plugins: config.plugins.map((p) =>
                p.instanceId === instanceId
                    ? { ...p, parameterValues: { ...p.parameterValues, ...nonSecrets } }
                    : p,
            ),
        };
        await save(updated);
        if (Object.keys(secrets).length > 0) {
            await saveSecrets(instanceId, secrets);
        }
    };

    return (
        <div className="flex h-screen">
            <nav
                className="w-48 border-r border-[var(--border)] p-4"
                data-testid="settings-sidebar"
            >
                <h2 className="mb-4 text-sm font-semibold flex items-center gap-1.5">
                    <img src={logo} alt="OmniUsage" className="h-4 w-4" />
                    OmniUsage
                </h2>
                <ul className="space-y-1 text-sm">
                    <li className="cursor-default rounded-[var(--radius)] px-2 py-1 text-[var(--muted-foreground)]">
                        一般
                    </li>
                    {config.plugins.map((p) => (
                        <li
                            key={p.instanceId}
                            className="cursor-default rounded-[var(--radius)] px-2 py-1"
                            data-testid={`settings-plugin-nav-${p.instanceId}`}
                        >
                            {p.name}
                        </li>
                    ))}
                </ul>
            </nav>

            <main className="flex-1 overflow-auto p-6">
                {config.plugins.map((p) => {
                    const params = metadataMap.get(p.instanceId)?.parameters;
                    if (!params?.length) {
                        return (
                            <div
                                key={p.instanceId}
                                className="text-sm text-[var(--muted-foreground)]"
                            >
                                {p.name} — 无可配置参数
                            </div>
                        );
                    }
                    return (
                        <SettingsForm
                            key={p.instanceId}
                            instanceId={p.instanceId}
                            name={p.name}
                            parameters={params}
                            values={{ ...p.parameterValues }}
                            hasSecrets={hasSecrets[p.instanceId] ?? {}}
                            onSave={handleSave}
                            onDuplicate={(id) => void duplicate(id)}
                        />
                    );
                })}
            </main>
        </div>
    );
}

import { useMemo, useState, useCallback } from "react";
import { ConnectorStatusCard } from "./ConnectorStatusCard";
import type { ConnectorInfo } from "../../shared/types/ipc";
import type { PluginConfiguration } from "../../shared/types/config";
import type { UsageItem, UsageProvider } from "../../shared/schemas/plugin-output";

const MONITORS: readonly { name: string; label: string }[] = [
    { name: "monitor_claude", label: "监控 Claude" },
    { name: "monitor_codex", label: "监控 Codex" },
    { name: "monitor_gemini", label: "监控 Gemini" },
    { name: "monitor_antigravity", label: "监控 Antigravity" },
    { name: "monitor_kimi", label: "监控 Kimi" },
];

const PROVIDER_LABELS: Record<UsageProvider, string> = {
    claude: "Claude",
    codex: "Codex",
    gemini: "Gemini",
    antigravity: "Antigravity",
    kimi: "Kimi",
    glm: "GLM",
    minimax: "MiniMax",
    deepseek: "DeepSeek",
    tavily: "Tavily",
};

interface CpaConnectorSettingsProps {
    connector: ConnectorInfo;
    config: Pick<
        PluginConfiguration,
        "endpointOverrides" | "parameterValues" | "refreshIntervalSeconds"
    >;
    hasSecrets: Record<string, boolean>;
    onSave: (
        nonSecrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => Promise<void> | void;
    onSaveSecrets: (secrets: Record<string, string>) => Promise<void> | void;
    onRefresh: () => Promise<void> | void;
}

function getDefaultValue(connector: ConnectorInfo, name: string) {
    return connector.metadata?.parameters?.find((param) => param.name === name)?.defaultValue;
}

function isEnabledValue(value: string | undefined) {
    return value?.toLowerCase() === "true";
}

function getSnapshotItems(connector: ConnectorInfo): readonly UsageItem[] {
    if (connector.snapshot.status === "ready") return connector.snapshot.items;
    if (connector.snapshot.status === "failed") return connector.snapshot.items ?? [];
    return [];
}

function getStatus(connector: ConnectorInfo) {
    if (connector.snapshot.status === "ready" && connector.snapshot.items.length > 0)
        return "已连接";
    if (connector.snapshot.status === "failed" && (connector.snapshot.items?.length ?? 0) > 0) {
        return "部分失败";
    }
    return "未连接";
}

function groupAccounts(items: readonly UsageItem[]) {
    const groups = new Map<UsageProvider, Set<string>>();
    for (const item of items) {
        const labels = groups.get(item.provider) ?? new Set<string>();
        labels.add(item.accountLabel);
        groups.set(item.provider, labels);
    }
    return Array.from(groups.entries());
}

export function CpaConnectorSettings({
    connector,
    config,
    hasSecrets,
    onSave,
    onSaveSecrets,
    onRefresh,
}: CpaConnectorSettingsProps) {
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [secret, setSecret] = useState(hasSecrets["cpa_mgmt_key"] ? "***" : "");
    const [endpoint, setEndpoint] = useState(
        config.endpointOverrides["default"] ?? connector.metadata?.endpoints?.["default"] ?? "",
    );
    const [monitors, setMonitors] = useState<Record<string, boolean>>(() => {
        const values: Record<string, boolean> = {};
        for (const monitor of MONITORS) {
            values[monitor.name] = isEnabledValue(
                config.parameterValues[monitor.name] ?? getDefaultValue(connector, monitor.name),
            );
        }
        return values;
    });

    const items = useMemo(() => getSnapshotItems(connector), [connector]);
    const accountGroups = useMemo(() => groupAccounts(items), [items]);

    const handleRefresh = useCallback(async () => {
        setError(null);
        try {
            await onRefresh();
        } catch {
            setError("同步失败");
        }
    }, [onRefresh]);

    const handleSubmit = useCallback(
        (event: React.SyntheticEvent<HTMLFormElement>) => {
            event.preventDefault();
            if (saving) return;

            const nonSecrets: Record<string, string> = { ...config.parameterValues };
            delete nonSecrets["cpa_mgmt_key"];
            for (const monitor of MONITORS) {
                nonSecrets[monitor.name] = monitors[monitor.name] ? "true" : "false";
            }

            const endpointOverrides: Record<string, string> = {
                ...config.endpointOverrides,
                default: endpoint.trim(),
            };
            const secrets: Record<string, string> = {};
            if (secret !== "***" && secret.trim() !== "") {
                secrets["cpa_mgmt_key"] = secret;
            }

            setSaving(true);
            setError(null);
            void Promise.resolve()
                .then(async () => {
                    if (Object.keys(secrets).length > 0) {
                        await onSaveSecrets(secrets);
                    }
                    await onSave(nonSecrets, endpointOverrides, config.refreshIntervalSeconds);
                })
                .catch(() => {
                    setError("保存失败");
                })
                .finally(() => {
                    setSaving(false);
                });
        },
        [config, endpoint, monitors, onSave, onSaveSecrets, saving, secret],
    );

    return (
        <form className="space-y-4" data-testid="cpa-connector-settings" onSubmit={handleSubmit}>
            <ConnectorStatusCard
                title="CPA 额度连接器"
                status={getStatus(connector)}
                details={`${String(items.length)} 个额度项`}
            />
            {error && (
                <div className="text-xs text-[var(--destructive)]" role="alert">
                    {error}
                </div>
            )}

            <label className="block space-y-1">
                <span className="text-xs text-[var(--muted-foreground)]">CPA-Manager URL</span>
                <input
                    aria-label="CPA-Manager URL"
                    className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    name="endpoint:default"
                    onChange={(event) => {
                        setEndpoint(event.target.value);
                    }}
                    type="url"
                    value={endpoint}
                />
            </label>

            <label className="block space-y-1">
                <span className="text-xs text-[var(--muted-foreground)]">管理密钥</span>
                <input
                    aria-label="管理密钥"
                    className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    name="cpa_mgmt_key"
                    onChange={(event) => {
                        setSecret(event.target.value);
                    }}
                    type="password"
                    value={secret}
                />
            </label>

            <div className="flex gap-2">
                <button
                    className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-1.5 text-sm"
                    onClick={() => {
                        void handleRefresh();
                    }}
                    type="button"
                >
                    测试连接
                </button>
                <button
                    className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-1.5 text-sm"
                    onClick={() => {
                        void handleRefresh();
                    }}
                    type="button"
                >
                    立即同步
                </button>
            </div>

            <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--muted-foreground)]">监控范围</div>
                {MONITORS.map((monitor) => (
                    <label key={monitor.name} className="flex items-center gap-2 text-sm">
                        <input
                            checked={monitors[monitor.name]}
                            name={monitor.name}
                            onChange={(event) => {
                                setMonitors((previous) => ({
                                    ...previous,
                                    [monitor.name]: event.target.checked,
                                }));
                            }}
                            type="checkbox"
                        />
                        <span>{monitor.label}</span>
                    </label>
                ))}
            </div>

            <div className="space-y-2">
                <div className="text-xs font-semibold text-[var(--muted-foreground)]">
                    已发现账号
                </div>
                {accountGroups.length === 0 ? (
                    <div className="text-xs text-[var(--muted-foreground)]">暂无账号</div>
                ) : (
                    accountGroups.map(([provider, labels]) => (
                        <div key={provider} className="space-y-1 text-sm">
                            <div className="font-medium">
                                {PROVIDER_LABELS[provider]} {labels.size}
                            </div>
                            {Array.from(labels).map((label) => (
                                <div key={label} className="text-xs text-[var(--muted-foreground)]">
                                    {label}
                                </div>
                            ))}
                        </div>
                    ))
                )}
            </div>

            <button
                className="rounded-[var(--radius)] bg-[var(--primary)] px-4 py-1.5 text-sm text-[var(--primary-foreground)]"
                data-testid="cpa-settings-save-btn"
                disabled={saving}
                type="submit"
            >
                {saving ? "保存中..." : "保存"}
            </button>
        </form>
    );
}

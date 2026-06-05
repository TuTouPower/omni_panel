import { useMemo, useState, useCallback, useEffect } from "react";
import { Icon, VendorMark } from "./Icon";
import type { ConnectorInfo } from "../../shared/types/ipc";
import type { PluginConfiguration } from "../../shared/types/config";
import type { UsageItem, UsageProvider } from "../../shared/schemas/plugin-output";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { relative_time } from "../lib/utils";

const MONITORS: readonly { name: string; label: string }[] = [
    { name: "monitor_claude", label: "监控 Claude" },
    { name: "monitor_codex", label: "监控 Codex" },
    { name: "monitor_gemini", label: "监控 Gemini" },
    { name: "monitor_antigravity", label: "监控 Antigravity" },
    { name: "monitor_kimi", label: "监控 Kimi" },
];

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
    onRemove?: () => Promise<void> | void;
}

function get_default_value(connector: ConnectorInfo, name: string) {
    return connector.metadata?.parameters?.find((param) => param.name === name)?.defaultValue;
}

function is_enabled_value(value: string | undefined) {
    return value?.toLowerCase() === "true";
}

function get_snapshot_items(connector: ConnectorInfo): readonly UsageItem[] {
    if (connector.snapshot.status === "ready") return connector.snapshot.items;
    if (connector.snapshot.status === "failed") return connector.snapshot.items ?? [];
    return [];
}

function get_status(connector: ConnectorInfo) {
    if (connector.snapshot.status === "ready" && connector.snapshot.items.length > 0)
        return "已连接";
    if (connector.snapshot.status === "failed" && (connector.snapshot.items?.length ?? 0) > 0) {
        return "部分失败";
    }
    return "未连接";
}

function group_accounts(items: readonly UsageItem[]) {
    const groups = new Map<UsageProvider, UsageItem[]>();
    for (const item of items) {
        const list = groups.get(item.provider) ?? [];
        list.push(item);
        groups.set(item.provider, list);
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
    onRemove,
}: CpaConnectorSettingsProps) {
    // onRefresh is part of the interface for future use
    void onRefresh;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [secret, setSecret] = useState(hasSecrets["cpa_mgmt_key"] ? "***" : "");
    const [endpoint, setEndpoint] = useState(
        config.endpointOverrides["default"] ?? connector.metadata?.endpoints?.["default"] ?? "",
    );
    const [monitors, setMonitors] = useState<Record<string, boolean>>(() => {
        const values: Record<string, boolean> = {};
        for (const monitor of MONITORS) {
            values[monitor.name] = is_enabled_value(
                config.parameterValues[monitor.name] ?? get_default_value(connector, monitor.name),
            );
        }
        return values;
    });
    const [autoSync, setAutoSync] = useState(true);
    const [failNotify, setFailNotify] = useState(true);
    const [syncInterval, setSyncInterval] = useState(
        config.refreshIntervalSeconds <= 60
            ? "1 分钟"
            : config.refreshIntervalSeconds <= 300
              ? "5 分钟"
              : config.refreshIntervalSeconds <= 900
                ? "15 分钟"
                : config.refreshIntervalSeconds <= 1800
                  ? "30 分钟"
                  : "仅手动",
    );
    const [openGrps, setOpenGrps] = useState<Set<string>>(() => {
        const items = get_snapshot_items(connector);
        const grps = group_accounts(items);
        return new Set(grps.map(([p]) => p));
    });

    // Sync state when connector changes (e.g. parent refreshes connector data)
    useEffect(() => {
        setSecret(hasSecrets["cpa_mgmt_key"] ? "***" : "");
        setEndpoint(
            config.endpointOverrides["default"] ?? connector.metadata?.endpoints?.["default"] ?? "",
        );
        const values: Record<string, boolean> = {};
        for (const monitor of MONITORS) {
            values[monitor.name] = is_enabled_value(
                config.parameterValues[monitor.name] ?? get_default_value(connector, monitor.name),
            );
        }
        setMonitors(values);
        setSyncInterval(
            config.refreshIntervalSeconds <= 60
                ? "1 分钟"
                : config.refreshIntervalSeconds <= 300
                  ? "5 分钟"
                  : config.refreshIntervalSeconds <= 900
                    ? "15 分钟"
                    : config.refreshIntervalSeconds <= 1800
                      ? "30 分钟"
                      : "仅手动",
        );
        const items = get_snapshot_items(connector);
        const grps = group_accounts(items);
        setOpenGrps(new Set(grps.map(([p]) => p)));
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset only on instanceId change
    }, [connector.instanceId]);

    const items = useMemo(() => get_snapshot_items(connector), [connector]);
    const accountGroups = useMemo(() => group_accounts(items), [items]);
    const status = get_status(connector);
    const isConnected = status === "已连接";
    const lastSync =
        connector.snapshot.status === "ready"
            ? relative_time(connector.snapshot.updatedAt)
            : connector.snapshot.status === "failed" && connector.snapshot.updatedAt
              ? relative_time(connector.snapshot.updatedAt)
              : "未同步";

    const handle_submit = useCallback(
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

            const intervalMap: Record<string, number> = {
                "1 分钟": 60,
                "5 分钟": 300,
                "15 分钟": 900,
                "30 分钟": 1800,
                仅手动: 86400,
            };

            setSaving(true);
            setError(null);
            void Promise.resolve()
                .then(async () => {
                    if (Object.keys(secrets).length > 0) {
                        await onSaveSecrets(secrets);
                    }
                    await onSave(nonSecrets, endpointOverrides, intervalMap[syncInterval] ?? 300);
                })
                .catch(() => {
                    setError("保存失败");
                })
                .finally(() => {
                    setSaving(false);
                });
        },
        [config, endpoint, monitors, onSave, onSaveSecrets, saving, secret, syncInterval],
    );

    const handle_remove = useCallback(() => {
        if (!onRemove) return;
        if (!window.confirm("确定移除该数据源？已发现的账号将被清除。")) return;
        void onRemove();
    }, [onRemove]);

    const toggleGrp = (id: string) => {
        setOpenGrps((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    return (
        <form className="cpa-detail" data-testid="cpa-connector-settings" onSubmit={handle_submit}>
            {/* left column: config */}
            <div className="cpa-cfg">
                <div className="cfg-sec">连接配置</div>
                <div className="cfg-field">
                    <div className="cfg-label">CPA-Manager URL</div>
                    <input
                        aria-label="CPA-Manager URL"
                        className="ad-input"
                        name="endpoint:default"
                        onChange={(event) => {
                            setEndpoint(event.target.value);
                        }}
                        type="url"
                        value={endpoint}
                    />
                </div>
                <div className="cfg-field">
                    <div className="cfg-label">API 密钥</div>
                    <input
                        aria-label="管理密钥"
                        className="ad-input mono"
                        name="cpa_mgmt_key"
                        onChange={(event) => {
                            setSecret(event.target.value);
                        }}
                        type="password"
                        value={secret}
                    />
                </div>

                <div className="cfg-sec">连接状态</div>
                <div className="cfg-status">
                    <span className={`csd${isConnected ? "" : " off"}`} />
                    <span className={isConnected ? "cs-ok" : "cs-err"}>{status}</span>
                    <span className="cs-sync">上次同步：{lastSync}</span>
                </div>

                <div className="cfg-sec">同步设置</div>
                <div className="cfg-row">
                    <div className="cr-text">
                        <div className="cr-title">同步间隔</div>
                    </div>
                    <div className="cr-ctrl">
                        <select
                            className="ad-input"
                            style={{ width: "auto", padding: "6px 10px" }}
                            value={syncInterval}
                            onChange={(e) => {
                                setSyncInterval(e.target.value);
                            }}
                        >
                            <option>1 分钟</option>
                            <option>5 分钟</option>
                            <option>15 分钟</option>
                            <option>30 分钟</option>
                            <option>仅手动</option>
                        </select>
                    </div>
                </div>
                <div className="cfg-row">
                    <div className="cr-text">
                        <div className="cr-title">自动同步</div>
                    </div>
                    <div className="cr-ctrl">
                        <button
                            className="sw"
                            data-on={autoSync ? "1" : "0"}
                            type="button"
                            onClick={() => {
                                setAutoSync((v) => !v);
                            }}
                        >
                            <i />
                        </button>
                    </div>
                </div>
                <div className="cfg-row">
                    <div className="cr-text">
                        <div className="cr-title">同步失败通知</div>
                    </div>
                    <div className="cr-ctrl">
                        <button
                            className="sw"
                            data-on={failNotify ? "1" : "0"}
                            type="button"
                            onClick={() => {
                                setFailNotify((v) => !v);
                            }}
                        >
                            <i />
                        </button>
                    </div>
                </div>

                <div className="cfg-sec">同步范围</div>
                {MONITORS.map((monitor) => (
                    <div className="cfg-row cfg-scope-row" key={monitor.name}>
                        <span className="cr-vendor">
                            <VendorMark
                                id={monitor.name.replace("monitor_", "") as UsageProvider}
                                size={20}
                            />
                            {monitor.label}
                        </span>
                        <div className="cr-ctrl">
                            <button
                                className="sw"
                                data-on={monitors[monitor.name] ? "1" : "0"}
                                type="button"
                                onClick={() => {
                                    setMonitors((prev) => ({
                                        ...prev,
                                        [monitor.name]: !prev[monitor.name],
                                    }));
                                }}
                            >
                                <i />
                            </button>
                        </div>
                    </div>
                ))}

                {error && (
                    <div className="text-xs" style={{ color: "var(--red)" }} role="alert">
                        {error}
                    </div>
                )}

                <div className="cpa-foot">
                    <button
                        className="cf-save"
                        data-testid="cpa-settings-save-btn"
                        disabled={saving}
                        type="submit"
                    >
                        <Icon name="check" size={15} color="#fff" />
                        {saving ? "保存中..." : "保存"}
                    </button>
                    <button className="cf-remove" type="button" onClick={handle_remove}>
                        <Icon name="trash" size={14} />
                        移除数据源
                    </button>
                </div>
            </div>

            {/* right column: discovered accounts */}
            <div className="cpa-disc">
                <div className="cfg-sec" style={{ marginTop: 0 }}>
                    已发现账号
                </div>
                <div className="disc-desc">由 CPA Manager 发现的账号，将显示在主面板中。</div>
                {accountGroups.length === 0 ? (
                    <div className="text-xs" style={{ color: "var(--text-3)" }}>
                        暂无账号
                    </div>
                ) : (
                    accountGroups.map(([provider, acctItems]) => (
                        <div className="disc-grp" key={provider}>
                            <button
                                className="disc-head"
                                data-open={openGrps.has(provider) ? "true" : "false"}
                                onClick={() => {
                                    toggleGrp(provider);
                                }}
                                type="button"
                            >
                                <VendorMark id={provider} size={20} />
                                <span className="dh-name">{PROVIDER_LABELS[provider]}</span>
                                <span className="dh-count">{acctItems.length} 个</span>
                                <span className="dh-chev">
                                    <Icon name="chevron" size={16} />
                                </span>
                            </button>
                            {openGrps.has(provider) && (
                                <div className="disc-rows">
                                    {acctItems.map((item) => (
                                        <div className="disc-row" key={item.id}>
                                            <span className="drd" />
                                            <span className="dr-note">{item.accountLabel}</span>
                                            <span className="dr-key">{item.accountId}</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </form>
    );
}

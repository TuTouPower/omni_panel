import { useState, useCallback, useEffect } from "react";
import { Button } from "./ui/Button";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { StatusDot } from "./ui/StatusDot";
import { Switch } from "./ui/Switch";
import { Icon, VendorMark } from "./Icon";
import { ConfirmDelete } from "./ConfirmDelete";
import { SecretInput } from "./ui/SecretInput";
import type { ConnectorInfo } from "../../shared/types/ipc";
import type { ConnectorConfiguration } from "../../shared/types/config";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { relative_time } from "../lib/utils";
import {
    REFRESH_INTERVAL_OPTIONS,
    refresh_seconds_to_label,
    refresh_label_to_seconds,
} from "../lib/refresh-intervals";

const MONITORS: readonly { name: string; provider: string }[] = [
    { name: "monitor_claude", provider: "claude" },
    { name: "monitor_codex", provider: "codex" },
    { name: "monitor_antigravity", provider: "antigravity" },
    { name: "monitor_kimi", provider: "kimi" },
];

interface CpaConnectorSettingsProps {
    connector: ConnectorInfo;
    config: Pick<
        ConnectorConfiguration,
        "endpointOverrides" | "parameterValues" | "refreshIntervalSeconds" | "enabled"
    >;
    hasSecrets: Record<string, boolean>;
    enabled: boolean;
    displayName: string;
    globalIntervalLabel: string;
    onSave: (
        nonSecrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
        displayName: string,
        shouldRefresh: boolean,
    ) => Promise<void> | void;
    onSaveSecrets: (secrets: Record<string, string>) => Promise<void> | void;
    onSaved?: (shouldRefresh: boolean) => void;
    onToggleEnabled: (enabled: boolean) => void;
    onRefresh: () => Promise<void> | void;
    onRemove?: () => Promise<void> | void;
    providerLabelMaps?:
        | Readonly<Partial<Record<string, Readonly<Record<string, string>>>>>
        | undefined;
    selectedProvider?: string | undefined;
    onEditLabelMap?: ((provider: string) => void) | undefined;
}

function get_default_value(connector: ConnectorInfo, name: string) {
    return connector.metadata?.parameters?.find((param) => param.name === name)?.defaultValue;
}

function is_enabled_value(value: string | number | undefined) {
    return String(value ?? "").toLowerCase() === "true";
}

function get_status(connector: ConnectorInfo) {
    if (connector.snapshot.status === "ready" && connector.snapshot.items.length > 0)
        return "已连接";
    if (connector.snapshot.status === "failed" && (connector.snapshot.items?.length ?? 0) > 0) {
        return "部分失败";
    }
    return "未连接";
}

export function CpaConnectorSettings({
    connector,
    config,
    hasSecrets,
    enabled,
    displayName,
    globalIntervalLabel,
    onSave,
    onSaveSecrets,
    onSaved,
    onToggleEnabled,
    onRefresh,
    onRemove,
    providerLabelMaps: _providerLabelMaps,
    selectedProvider: _selectedProvider,
    onEditLabelMap,
}: CpaConnectorSettingsProps) {
    void onRefresh;
    void _providerLabelMaps;
    void _selectedProvider;
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [alias, setAlias] = useState(displayName);
    const [secret, setSecret] = useState("");
    const [loaded_secret, set_loaded_secret] = useState("");
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
    const [followGlobal, setFollowGlobal] = useState(() => {
        return config.refreshIntervalSeconds <= 0;
    });
    const [syncInterval, setSyncInterval] = useState(
        refresh_seconds_to_label(config.refreshIntervalSeconds || 300),
    );
    const [confirmRemove, setConfirmRemove] = useState(false);

    // Sync state when connector changes (e.g. parent refreshes connector data).
    // t267: 不重置 endpoint 也不依赖 config——config 变化（保存 echo / 外部广播）若重置
    // 表单会覆盖用户编辑中的输入（实测 fill/press 后 endpoint 被 config 旧值重置回
    // 默认 17863，保存被静默跳过）。表单打开期间 config 变化应保留用户输入；卸载后
    // 重开会用新 config。displayName 变化仍同步 alias，hasSecrets 变化同步密钥。
    useEffect(() => {
        setAlias(displayName);
        const values: Record<string, boolean> = {};
        for (const monitor of MONITORS) {
            values[monitor.name] = is_enabled_value(
                config.parameterValues[monitor.name] ?? get_default_value(connector, monitor.name),
            );
        }
        setMonitors(values);
        setFollowGlobal(config.refreshIntervalSeconds <= 0);
        setSyncInterval(refresh_seconds_to_label(config.refreshIntervalSeconds || 300));
        let cancelled = false;
        void window.usageboard.config
            .getSecrets(connector.instanceId)
            .then((secrets) => {
                if (cancelled) return;
                const value = secrets["cpa_mgmt_key"] ?? "";
                set_loaded_secret(value);
                setSecret(value);
            })
            .catch(() => {
                if (cancelled) return;
                set_loaded_secret("");
                setSecret("");
            });
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: reset on external data change, not every connector snapshot
    }, [connector.instanceId, hasSecrets, displayName]);

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

            if (!endpoint.trim()) {
                setError("CPA-Manager URL 不能为空");
                return;
            }

            const nonSecrets: Record<string, string> = {
                ...Object.fromEntries(
                    Object.entries(config.parameterValues).map(([k, v]) => [k, String(v)]),
                ),
            };
            delete nonSecrets["cpa_mgmt_key"];
            for (const monitor of MONITORS) {
                nonSecrets[monitor.name] = monitors[monitor.name] ? "true" : "false";
            }

            const endpointOverrides: Record<string, string> = {
                ...config.endpointOverrides,
                default: endpoint.trim(),
            };
            const secrets: Record<string, string> = {};
            if (secret.trim() !== "" && secret !== loaded_secret) {
                secrets["cpa_mgmt_key"] = secret;
            }

            const effectiveInterval = followGlobal ? 0 : refresh_label_to_seconds(syncInterval);
            const normalizedAlias = alias.trim();
            const currentEndpoint = (
                config.endpointOverrides["default"] ??
                connector.metadata?.endpoints?.["default"] ??
                ""
            ).trim();
            const endpointChanged = endpointOverrides["default"] !== currentEndpoint;
            const monitorChanged = MONITORS.some((monitor) => {
                const current = is_enabled_value(
                    config.parameterValues[monitor.name] ??
                        get_default_value(connector, monitor.name),
                );
                return monitors[monitor.name] !== current;
            });
            const configChanged =
                endpointChanged ||
                monitorChanged ||
                effectiveInterval !== config.refreshIntervalSeconds ||
                normalizedAlias !== displayName.trim() ||
                "cpa_mgmt_key" in config.parameterValues;
            const secretChanged = Object.keys(secrets).length > 0;

            setSaving(true);
            setError(null);
            void Promise.resolve()
                .then(async () => {
                    if (secretChanged) {
                        await onSaveSecrets(secrets);
                    }
                    if (configChanged) {
                        await onSave(
                            nonSecrets,
                            endpointOverrides,
                            effectiveInterval,
                            normalizedAlias,
                            endpointChanged || monitorChanged || secretChanged,
                        );
                    }
                    onSaved?.(endpointChanged || monitorChanged || secretChanged);
                })
                .catch(() => {
                    setError("保存失败");
                })
                .finally(() => {
                    setSaving(false);
                });
        },
        [
            config,
            endpoint,
            monitors,
            onSave,
            onSaveSecrets,
            onSaved,
            saving,
            secret,
            loaded_secret,
            syncInterval,
            followGlobal,
            alias,
            connector,
            displayName,
        ],
    );

    const handle_remove = useCallback(() => {
        if (!onRemove) return;
        setConfirmRemove(true);
    }, [onRemove]);

    return (
        <form
            className="flex min-h-0 flex-1"
            data-testid="cpa-connector-settings"
            onSubmit={handle_submit}
        >
            {/* left column: config */}
            <div className="w-1/2 shrink-0 overflow-y-auto border-r-[0.5px] border-[var(--color-hairline)] pb-4 pr-6 [scrollbar-width:thin] [scrollbar-color:var(--color-scrollbar-thumb)_transparent]">
                <div
                    className="flex items-center gap-3 border-b-[0.5px] border-[var(--color-hairline)] py-[10px] last:border-b-0"
                    data-testid="cfg-row"
                >
                    <div className="min-w-0">
                        <div className="text-[length:var(--text-body-md)] font-[550] text-[var(--color-on-surface)]">
                            启用
                        </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center">
                        <Switch
                            checked={enabled}
                            data-on={enabled ? "1" : "0"}
                            aria-label="启用"
                            onChange={() => {
                                onToggleEnabled(!enabled);
                            }}
                        />
                    </div>
                </div>
                <div className="mb-3 mt-1 text-[length:var(--text-label-md)] font-semibold uppercase tracking-[0.05em] text-[var(--color-on-surface-muted)] [&:not(:first-child)]:mt-6">
                    连接配置
                </div>
                <div className="mb-3 last:mb-0">
                    <div className="mb-2 block text-[length:var(--text-body-sm)] font-semibold text-[var(--color-on-surface-variant)]">
                        备注
                    </div>
                    <Input
                        aria-label="备注"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        onChange={(event) => {
                            setAlias(event.target.value);
                        }}
                        type="text"
                        value={alias}
                    />
                </div>
                <div className="mb-3 last:mb-0">
                    <div className="mb-2 block text-[length:var(--text-body-sm)] font-semibold text-[var(--color-on-surface-variant)]">
                        CPA-Manager URL
                    </div>
                    <Input
                        aria-label="CPA-Manager URL"
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        name="endpoint:default"
                        onChange={(event) => {
                            setEndpoint(event.target.value);
                        }}
                        type="url"
                        value={endpoint}
                    />
                </div>
                <div className="mb-3 last:mb-0">
                    <div className="mb-2 block text-[length:var(--text-body-sm)] font-semibold text-[var(--color-on-surface-variant)]">
                        API 密钥
                    </div>
                    <SecretInput
                        name="cpa_mgmt_key"
                        aria-label="管理密钥"
                        value={secret}
                        onChange={(e) => {
                            setSecret(e.target.value);
                        }}
                    />
                </div>

                <div className="mb-3 mt-1 text-[length:var(--text-label-md)] font-semibold uppercase tracking-[0.05em] text-[var(--color-on-surface-muted)] [&:not(:first-child)]:mt-6">
                    连接状态
                </div>
                <div className="flex items-center gap-2 rounded-md bg-[var(--color-field-bg)] px-3 py-[10px]">
                    <StatusDot tone={isConnected ? "success" : "neutral"} />
                    <span
                        className={
                            "text-[length:var(--text-body-md)] font-semibold " +
                            (isConnected
                                ? "text-[var(--color-success)]"
                                : "text-[var(--color-error)]")
                        }
                    >
                        {status}
                    </span>
                    <span className="ml-auto text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                        上次同步：{lastSync}
                    </span>
                </div>

                <div className="mb-3 mt-1 text-[length:var(--text-label-md)] font-semibold uppercase tracking-[0.05em] text-[var(--color-on-surface-muted)] [&:not(:first-child)]:mt-6">
                    刷新
                </div>
                <div
                    className="flex items-center gap-3 border-b-[0.5px] border-[var(--color-hairline)] py-[10px] last:border-b-0"
                    data-testid="cfg-row"
                >
                    <div className="min-w-0">
                        <div className="text-[length:var(--text-body-md)] font-[550] text-[var(--color-on-surface)]">
                            跟随全局自动刷新间隔
                        </div>
                    </div>
                    <div className="ml-auto flex shrink-0 items-center">
                        <Switch
                            checked={followGlobal}
                            data-on={followGlobal ? "1" : "0"}
                            aria-label="跟随全局自动刷新间隔"
                            onChange={() => {
                                setFollowGlobal((v) => !v);
                            }}
                        />
                    </div>
                </div>
                {followGlobal ? (
                    <div
                        className="flex items-center gap-3 border-b-[0.5px] border-[var(--color-hairline)] py-[10px] last:border-b-0"
                        data-testid="cfg-row"
                    >
                        <div className="min-w-0">
                            <div className="text-[length:var(--text-body-sm)] text-[var(--color-on-surface-muted)]">
                                当前全局为「{globalIntervalLabel}」自动刷新
                            </div>
                        </div>
                    </div>
                ) : (
                    <div
                        className="flex items-center gap-3 border-b-[0.5px] border-[var(--color-hairline)] py-[10px] last:border-b-0"
                        data-testid="cfg-row"
                    >
                        <div className="min-w-0">
                            <div className="text-[length:var(--text-body-md)] font-[550] text-[var(--color-on-surface)]">
                                该数据源刷新频率
                            </div>
                        </div>
                        <div className="ml-auto flex shrink-0 items-center">
                            <Select
                                className="w-auto"
                                value={syncInterval}
                                onChange={(e) => {
                                    setSyncInterval(
                                        e.target
                                            .value as (typeof REFRESH_INTERVAL_OPTIONS)[number]["label"],
                                    );
                                }}
                            >
                                {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                                    <option key={opt.label}>{opt.label}</option>
                                ))}
                            </Select>
                        </div>
                    </div>
                )}

                {error && (
                    <div
                        className="text-[length:var(--text-body-sm)] text-[var(--color-error)]"
                        role="alert"
                    >
                        {error}
                    </div>
                )}

                <div className="mt-6 flex items-center gap-[10px]">
                    <Button
                        variant="primary"
                        data-testid="cpa-settings-save-btn"
                        disabled={saving}
                        type="submit"
                    >
                        <Icon name="check" size={15} />
                        {saving ? "保存中..." : "保存"}
                    </Button>
                    <Button
                        variant="secondary"
                        className="text-[var(--color-error)]"
                        type="button"
                        onClick={handle_remove}
                    >
                        <Icon name="trash" size={14} />
                        移除数据源
                    </Button>
                </div>
            </div>

            {/* right column: sync scope */}
            <div className="min-w-0 flex-1 overflow-y-auto pb-4 pl-6 [scrollbar-width:thin] [scrollbar-color:var(--color-scrollbar-thumb)_transparent]">
                <div className="mb-3 mt-1 text-[length:var(--text-label-md)] font-semibold uppercase tracking-[0.05em] text-[var(--color-on-surface-muted)] first:mt-0 [&:not(:first-child)]:mt-6">
                    同步范围
                </div>
                <div className="mb-[14px] text-[length:var(--text-body-sm)] leading-[1.5] text-[var(--color-on-surface-muted)]">
                    选择要同步的服务商，开启后将自动采集对应账号用量。
                </div>
                {MONITORS.map((monitor) => (
                    <div
                        className="flex items-center gap-3 border-b-[0.5px] border-[var(--color-hairline)] py-[10px] last:border-b-0"
                        data-testid="cfg-scope-row"
                        key={monitor.name}
                    >
                        <span
                            className="flex items-center gap-[9px] text-[length:var(--text-body-md)] font-[550] text-[var(--color-on-surface)]"
                            data-testid="cfg-vendor"
                        >
                            <VendorMark id={monitor.provider} size={20} />
                            {PROVIDER_LABELS[monitor.provider]}
                        </span>
                        <div className="ml-auto flex shrink-0 items-center">
                            {onEditLabelMap && (
                                <Button
                                    variant="icon"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    title="编辑数据标签映射"
                                    aria-label="编辑数据标签映射"
                                    type="button"
                                    onClick={() => {
                                        onEditLabelMap(monitor.provider);
                                    }}
                                >
                                    <Icon name="tag" size={14} />
                                </Button>
                            )}
                            <Switch
                                checked={monitors[monitor.name] ?? false}
                                data-on={monitors[monitor.name] ? "1" : "0"}
                                aria-label={`启用${PROVIDER_LABELS[monitor.provider] ?? monitor.provider}同步`}
                                onChange={() => {
                                    setMonitors((prev) => ({
                                        ...prev,
                                        [monitor.name]: !prev[monitor.name],
                                    }));
                                }}
                            />
                        </div>
                    </div>
                ))}
            </div>
            {confirmRemove && (
                <ConfirmDelete
                    name={displayName}
                    title="移除数据源"
                    confirmLabel="移除数据源"
                    onCancel={() => {
                        setConfirmRemove(false);
                    }}
                    onConfirm={() => {
                        setConfirmRemove(false);
                        void onRemove?.();
                    }}
                />
            )}
        </form>
    );
}

import { useState, useCallback, useEffect, useRef } from "react";
import type { PluginParameterMetadata } from "../../shared/schemas/plugin-metadata";
import type { MetricRecord } from "../../shared/schemas/plugin-output";
import type { AccountOverrides } from "../../shared/types/config";
import {
    REFRESH_INTERVAL_OPTIONS,
    refresh_seconds_to_label,
    refresh_label_to_seconds,
} from "../lib/refresh-intervals";
import { format_usage_period_label } from "../lib/provider-usage";
import { build_label_map_rows, type LabelMapRow } from "../lib/label-map-util";
import { Icon } from "./Icon";
import { GrokLoginSection } from "./GrokLoginSection";
import { SecretInput } from "./SecretInput";

interface SettingsFormProps {
    instanceId: string;
    parameters: PluginParameterMetadata[];
    values: Record<string, string>;
    hasSecrets?: Record<string, boolean> | undefined;
    endpoints?: Record<string, string | null> | undefined;
    endpointValues?: Record<string, string> | undefined;
    refreshIntervalSeconds: number;
    globalIntervalLabel: string;
    manualRefreshOnly?: boolean | undefined;
    providerId?: string | undefined;
    displayName?: string | undefined;
    onCookieLogin?: ((instanceId: string) => Promise<boolean>) | undefined;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
        displayName?: string,
    ) => Promise<void>;
    onDuplicate?: ((instanceId: string) => void) | undefined;
    existingLabelMap?: Readonly<Record<string, string>> | undefined;
    onSaveLabelMap?:
        | ((instanceId: string, map: Record<string, string>) => Promise<void>)
        | undefined;
    forcePercent?: boolean | undefined;
    onForcePercentChange?: ((provider: string, force: boolean) => Promise<void>) | undefined;
    /** t048: upcomingResetWatched 查表（来自 config.accountOverrides）。 */
    watchedMetrics?: AccountOverrides["upcomingResetWatched"] | undefined;
    /** t048: 切换某 raw_label 的即将重置监控（按 account_keys 聚合由上层处理）。 */
    onToggleWatched?: ((raw_label: string) => void) | undefined;
}

export function SettingsForm({
    instanceId,
    parameters,
    values,
    hasSecrets,
    endpoints,
    endpointValues,
    refreshIntervalSeconds,
    globalIntervalLabel,
    manualRefreshOnly,
    providerId,
    displayName,
    onCookieLogin,
    onSave,
    onDuplicate,
    existingLabelMap,
    onSaveLabelMap,
    forcePercent = false,
    onForcePercentChange,
    watchedMetrics,
    onToggleWatched,
}: SettingsFormProps) {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [loginLoading, setLoginLoading] = useState(false);
    const [loginMessage, setLoginMessage] = useState<string | null>(null);
    const [labelMapExpanded, setLabelMapExpanded] = useState(false);
    const [labelRows, setLabelRows] = useState<LabelMapRow[]>([]);
    const [labelLoading, setLabelLoading] = useState(false);
    const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});
    const [followGlobal, setFollowGlobal] = useState(() => refreshIntervalSeconds <= 0);
    const [syncInterval, setSyncInterval] = useState(
        refresh_seconds_to_label(refreshIntervalSeconds || 300),
    );
    const [secret_values, set_secret_values] = useState<Record<string, string>>({});
    const [secrets_loaded, set_secrets_loaded] = useState(false);
    const [loaded_secrets, set_loaded_secrets] = useState<Record<string, string>>({});
    const [force_percent_local, set_force_percent_local] = useState(forcePercent);
    const mounted_ref = useRef(true);
    const saved_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        set_force_percent_local(forcePercent);
    }, [forcePercent]);

    useEffect(() => {
        mounted_ref.current = true;
        let cancelled = false;
        set_secrets_loaded(false);
        void window.usageboard.config
            .getSecrets(instanceId)
            .then((secrets) => {
                if (cancelled || !mounted_ref.current) return;
                set_loaded_secrets(secrets);
                set_secret_values(secrets);
                set_secrets_loaded(true);
            })
            .catch(() => {
                if (cancelled || !mounted_ref.current) return;
                set_loaded_secrets({});
                set_secret_values({});
                set_secrets_loaded(true);
            });
        return () => {
            cancelled = true;
            mounted_ref.current = false;
            if (saved_timeout_ref.current !== null) {
                clearTimeout(saved_timeout_ref.current);
            }
        };
    }, [instanceId]);

    const handle_cookie_login = useCallback(
        (_secret_name: string) => {
            void _secret_name;
            if (!onCookieLogin) return;
            setLoginLoading(true);
            setLoginMessage(null);
            void onCookieLogin(instanceId)
                .then(async (ok) => {
                    if (!mounted_ref.current) return;
                    setLoginLoading(false);
                    if (ok) {
                        try {
                            const secrets = await window.usageboard.config.getSecrets(instanceId);
                            set_loaded_secrets(secrets);
                            set_secret_values(secrets);
                        } catch {
                            /* keep previous */
                        }
                        setLoginMessage("网页登录成功，Cookie 已保存");
                    } else {
                        setLoginMessage("未捕获到 Cookie，请确认登录成功后再关闭窗口");
                    }
                })
                .catch(() => {
                    if (!mounted_ref.current) return;
                    setLoginLoading(false);
                    setLoginMessage("网页登录失败，请重试");
                });
        },
        [instanceId, onCookieLogin],
    );

    useEffect(() => {
        if (!labelMapExpanded || !providerId || !onSaveLabelMap) return;
        void (async () => {
            setLabelLoading(true);
            try {
                const state = await window.usageboard.connector.getState(instanceId);
                const items =
                    state.status === "ready" || state.status === "failed"
                        ? (state.items ?? [])
                        : [];
                const filtered = (items as MetricRecord[]).filter(
                    (item) => item.provider === providerId,
                );
                const rows = build_label_map_rows(filtered, existingLabelMap, (item) =>
                    format_usage_period_label(item.raw_label, item.normalized_label),
                );
                if (mounted_ref.current) setLabelRows(rows);
            } catch {
                if (mounted_ref.current) setLabelRows([]);
            } finally {
                if (mounted_ref.current) setLabelLoading(false);
            }
        })();
    }, [labelMapExpanded, instanceId, providerId, existingLabelMap, onSaveLabelMap]);

    const handle_label_edit = (raw: string, value: string) => {
        setLabelEdits((prev) => ({ ...prev, [raw]: value }));
    };

    const handle_submit = useCallback(
        (e: React.SyntheticEvent<HTMLFormElement>) => {
            e.preventDefault();
            if (saving) return;
            const formData = new FormData(e.currentTarget);
            const nonSecrets: Record<string, string> = {};
            const secrets: Record<string, string> = {};
            const endpointOverrides: Record<string, string> = {};

            for (const param of parameters) {
                if (param.type === "boolean") {
                    const checked = formData.get(param.name) === "on";
                    nonSecrets[param.name] = checked ? "true" : "false";
                } else if (param.type === "secret") {
                    const val = secret_values[param.name] ?? "";
                    if (val !== "" && val !== (loaded_secrets[param.name] ?? "")) {
                        secrets[param.name] = val;
                    }
                } else {
                    const val = formData.get(param.name) as string | null;
                    if (val === null) continue;
                    nonSecrets[param.name] = val;
                }
            }

            for (const endpointName of Object.keys(endpoints ?? {})) {
                const val = formData.get(`endpoint:${endpointName}`) as string | null;
                if (val !== null && val.trim() !== "") {
                    endpointOverrides[endpointName] = val.trim();
                }
            }

            const intervalSeconds = followGlobal ? 0 : refresh_label_to_seconds(syncInterval);
            const display_name = (formData.get("displayName") as string | null)?.trim();

            setSaving(true);
            setSaved(false);
            setSaveError(null);
            void onSave(
                instanceId,
                nonSecrets,
                secrets,
                endpointOverrides,
                intervalSeconds,
                display_name,
            )
                .then(async () => {
                    if (onSaveLabelMap && Object.keys(labelEdits).length > 0) {
                        const map: Record<string, string> = {};
                        for (const [raw, display] of Object.entries(labelEdits)) {
                            map[raw] = display;
                        }
                        await onSaveLabelMap(instanceId, map);
                    }
                    if (
                        providerId &&
                        onForcePercentChange &&
                        force_percent_local !== forcePercent
                    ) {
                        await onForcePercentChange(providerId, force_percent_local);
                    }
                    if (!mounted_ref.current) return;
                    if (Object.keys(secrets).length > 0) {
                        set_loaded_secrets((prev) => ({ ...prev, ...secrets }));
                    }
                    setSaved(true);
                    saved_timeout_ref.current = setTimeout(() => {
                        if (mounted_ref.current) {
                            setSaved(false);
                        }
                    }, 1500);
                })
                .catch((err: unknown) => {
                    const msg = err instanceof Error ? err.message : String(err);
                    if (mounted_ref.current) {
                        setSaveError(msg);
                    }
                })
                .finally(() => {
                    if (mounted_ref.current) {
                        setSaving(false);
                    }
                });
        },
        [
            endpoints,
            followGlobal,
            instanceId,
            onSave,
            parameters,
            saving,
            syncInterval,
            labelEdits,
            onSaveLabelMap,
            secret_values,
            loaded_secrets,
            providerId,
            onForcePercentChange,
            force_percent_local,
            forcePercent,
        ],
    );

    const visible_parameters = parameters.filter(
        (param) => providerId !== "opencode_go" || param.name !== "ACCOUNT_LABEL",
    );

    return (
        <form
            onSubmit={handle_submit}
            className="ad-body-form"
            data-testid={`settings-form-${instanceId}`}
        >
            <div className="ad-field">
                <label className="ad-label" htmlFor="displayName">
                    备注<span className="ad-opt">显示用</span>
                </label>
                <input
                    type="text"
                    id="displayName"
                    name="displayName"
                    defaultValue={displayName ?? ""}
                    placeholder="例如：工作账号"
                    className="ad-input"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                />
            </div>
            {providerId === "grok" && <GrokLoginSection instance_id={instanceId} />}
            {visible_parameters.map((param) => (
                <div className="ad-field" key={param.name}>
                    <label className="ad-label" htmlFor={param.name}>
                        {param["label@zh-Hans"] ?? param.label}
                    </label>
                    {param.type === "boolean" ? (
                        <input
                            type="checkbox"
                            id={param.name}
                            name={param.name}
                            defaultChecked={values[param.name] === "true"}
                            className="h-4 w-4"
                        />
                    ) : param.type === "choice" ? (
                        <select
                            id={param.name}
                            name={param.name}
                            defaultValue={values[param.name] ?? param.defaultValue ?? ""}
                            required={param.required}
                            className="ad-input"
                        >
                            {param.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </select>
                    ) : param.type === "secret" ? (
                        <div className="ad-secret-row">
                            <SecretInput
                                id={param.name}
                                name={param.name}
                                value={secret_values[param.name] ?? ""}
                                onChange={(v) => {
                                    set_secret_values((prev) => ({ ...prev, [param.name]: v }));
                                }}
                                placeholder={
                                    secrets_loaded
                                        ? param.placeholder
                                        : hasSecrets?.[param.name]
                                          ? "加载中…"
                                          : param.placeholder
                                }
                                required={param.required && !hasSecrets?.[param.name]}
                                disabled={!secrets_loaded}
                            />
                            {providerId && param.name === "SESSION_COOKIE" && onCookieLogin && (
                                <button
                                    type="button"
                                    className="cf-secondary"
                                    disabled={loginLoading}
                                    onClick={() => {
                                        handle_cookie_login(param.name);
                                    }}
                                >
                                    {loginLoading ? "登录中..." : "网页登录"}
                                </button>
                            )}
                            {providerId && param.name === "SESSION_COOKIE" && loginMessage ? (
                                <p className="ad-hint">{loginMessage}</p>
                            ) : null}
                        </div>
                    ) : (
                        <input
                            type={param.type === "integer" ? "number" : "text"}
                            id={param.name}
                            name={param.name}
                            defaultValue={values[param.name] ?? param.defaultValue ?? ""}
                            placeholder={param.placeholder}
                            required={param.required}
                            className="ad-input"
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                    )}
                    {typeof param.description === "string" && (
                        <p className="ad-hint">{param.description}</p>
                    )}
                </div>
            ))}
            {providerId !== "grok" &&
                Object.keys(endpoints ?? {}).map((endpointName) => (
                    <div className="ad-field" key={endpointName}>
                        <label className="ad-label">
                            {endpointName === "default" ? "接口地址" : `接口地址 (${endpointName})`}
                        </label>
                        <input
                            type="url"
                            name={`endpoint:${endpointName}`}
                            defaultValue={
                                endpointValues?.[endpointName] ?? endpoints?.[endpointName] ?? ""
                            }
                            placeholder={
                                endpointName === "default" ? "https://api.example.com" : undefined
                            }
                            required={endpoints?.[endpointName] === null}
                            aria-label={
                                endpointName === "default"
                                    ? "接口地址"
                                    : `接口地址 (${endpointName})`
                            }
                            className="ad-input"
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                    </div>
                ))}
            <div className="ad-field">
                <label className="ad-label">刷新</label>
                {manualRefreshOnly ? (
                    <p className="ad-hint" data-testid={`settings-manual-only-${instanceId}`}>
                        仅手动刷新（刷新时会消耗一次 API 配额）
                    </p>
                ) : (
                    <>
                        <div
                            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}
                        >
                            <span style={{ fontSize: 13 }}>跟随全局自动刷新间隔</span>
                            <button
                                className="sw"
                                data-on={followGlobal ? "1" : "0"}
                                type="button"
                                onClick={() => {
                                    setFollowGlobal((v) => !v);
                                }}
                                data-testid={`settings-follow-global-${instanceId}`}
                            >
                                <i />
                            </button>
                        </div>
                        {followGlobal ? (
                            <p
                                className="ad-hint"
                                data-testid={`settings-global-label-${instanceId}`}
                            >
                                当前全局为「{globalIntervalLabel}」自动刷新
                            </p>
                        ) : (
                            <div style={{ marginTop: 4 }}>
                                <select
                                    className="ad-input"
                                    style={{ width: "auto", padding: "6px 10px" }}
                                    value={syncInterval}
                                    onChange={(e) => {
                                        setSyncInterval(
                                            e.target
                                                .value as (typeof REFRESH_INTERVAL_OPTIONS)[number]["label"],
                                        );
                                    }}
                                    data-testid={`settings-sync-interval-${instanceId}`}
                                >
                                    {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                                        <option key={opt.label}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </>
                )}
            </div>
            {providerId && onForcePercentChange && (
                <div className="ad-field">
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13 }}>用量数字统一为百分比</span>
                        <button
                            className="sw"
                            data-on={force_percent_local ? "1" : "0"}
                            type="button"
                            onClick={() => {
                                set_force_percent_local((v) => !v);
                            }}
                            data-testid={`settings-force-percent-${instanceId}`}
                        >
                            <i />
                        </button>
                    </div>
                    <p className="ad-hint">该厂商下所有账号用量统一显示为百分比</p>
                </div>
            )}
            {onSaveLabelMap && providerId && (
                <div className="ad-field">
                    <button
                        type="button"
                        className="ad-label"
                        style={{ cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
                        onClick={() => {
                            setLabelMapExpanded((v) => !v);
                        }}
                    >
                        <Icon
                            name="chevron"
                            size={14}
                            style={{
                                transform: labelMapExpanded ? "rotate(90deg)" : "rotate(0deg)",
                                transition: "transform 0.15s",
                            }}
                        />
                        数据标签映射
                    </button>
                    {labelMapExpanded && (
                        <div style={{ marginTop: 8 }}>
                            {labelLoading ? (
                                <div className="text-sm text-[var(--text-3)]">加载标签数据…</div>
                            ) : labelRows.length === 0 ? (
                                <div className="text-sm text-[var(--text-3)]">
                                    暂无可映射的数据标签
                                </div>
                            ) : (
                                <>
                                    <div className="lm-cols">
                                        <span>原始标签</span>
                                        <span>显示名称</span>
                                    </div>
                                    {labelRows.map((r) => {
                                        const v = labelEdits[r.raw] ?? r.display;
                                        const provider_watched = watchedMetrics?.[providerId];
                                        const watched = r.account_keys.every(
                                            (k) => provider_watched?.[k]?.includes(r.raw) ?? false,
                                        );
                                        return (
                                            <div className="lm-row" key={r.raw}>
                                                <code className="lm-raw">{r.raw}</code>
                                                <span className="lm-arrow">
                                                    <Icon name="chevron" size={14} />
                                                </span>
                                                <input
                                                    className="lm-input"
                                                    value={v}
                                                    placeholder={r.raw}
                                                    spellCheck={false}
                                                    autoCorrect="off"
                                                    autoCapitalize="off"
                                                    onChange={(e) => {
                                                        handle_label_edit(r.raw, e.target.value);
                                                    }}
                                                />
                                                {onToggleWatched && (
                                                    <button
                                                        type="button"
                                                        className="lm-watch"
                                                        title="监控该数据标签的即将重置"
                                                        aria-label="监控该数据标签的即将重置"
                                                        aria-pressed={watched}
                                                        onClick={() => {
                                                            onToggleWatched(r.raw);
                                                        }}
                                                    >
                                                        <Icon
                                                            name="bell"
                                                            size={14}
                                                            style={{
                                                                opacity: watched ? 1 : 0.35,
                                                            }}
                                                        />
                                                    </button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </>
                            )}
                        </div>
                    )}
                </div>
            )}
            <div className="ad-foot">
                <div className="ad-foot-r">
                    {onDuplicate && (
                        <button
                            type="button"
                            data-testid={`settings-duplicate-btn-${instanceId}`}
                            onClick={() => {
                                onDuplicate(instanceId);
                            }}
                            className="cf-secondary"
                        >
                            复制
                        </button>
                    )}
                    <button
                        type="submit"
                        disabled={saving}
                        data-testid={`settings-save-btn-${instanceId}`}
                        className={"ad-btn primary" + (saved ? " saved" : "")}
                    >
                        {saving ? "保存中..." : saved ? "已保存" : "保存"}
                    </button>
                    {saveError ? (
                        <span className="ad-error" role="alert">
                            {saveError}
                        </span>
                    ) : null}
                </div>
            </div>
        </form>
    );
}

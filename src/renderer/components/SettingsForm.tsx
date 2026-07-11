import { useState, useCallback, useEffect, useRef } from "react";
import type { PluginParameterMetadata } from "../../shared/schemas/plugin-metadata";
import {
    REFRESH_INTERVAL_OPTIONS,
    refresh_seconds_to_label,
    refresh_label_to_seconds,
} from "../lib/refresh-intervals";
import { format_usage_period_label } from "../lib/provider-usage";
import { Icon } from "./Icon";

const SECRET_PLACEHOLDER = "•".repeat(12);

interface LabelMapRow {
    raw: string;
    display: string;
}

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
}: SettingsFormProps) {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
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
    const mounted_ref = useRef(true);
    const saved_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handle_cookie_login = useCallback(
        (secret_name: string) => {
            if (!onCookieLogin) return;
            setLoginLoading(true);
            setLoginMessage(null);
            void onCookieLogin(instanceId)
                .then((ok) => {
                    if (!mounted_ref.current) return;
                    setLoginLoading(false);
                    if (ok) {
                        const el = document.getElementById(secret_name) as HTMLInputElement | null;
                        if (el) el.value = SECRET_PLACEHOLDER;
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
        mounted_ref.current = true;
        return () => {
            mounted_ref.current = false;
            if (saved_timeout_ref.current !== null) {
                clearTimeout(saved_timeout_ref.current);
            }
        };
    }, []);

    // Fetch raw labels when label map section is expanded
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
                const filtered = items.filter(
                    (item: { provider: string }) => item.provider === providerId,
                );
                const seen = new Set<string>();
                const rows: LabelMapRow[] = [];
                for (const item of filtered) {
                    const raw: string = item.raw_label;
                    if (seen.has(raw)) continue;
                    seen.add(raw);
                    const name: string = item.normalized_label;
                    rows.push({
                        raw,
                        display: existingLabelMap?.[raw] ?? format_usage_period_label(raw, name),
                    });
                }
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
                } else {
                    const val = formData.get(param.name) as string | null;
                    if (val === null) continue;
                    if (param.type === "secret") {
                        if (val !== SECRET_PLACEHOLDER && val !== "") {
                            secrets[param.name] = val;
                        }
                    } else {
                        nonSecrets[param.name] = val;
                    }
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
            void onSave(
                instanceId,
                nonSecrets,
                secrets,
                endpointOverrides,
                intervalSeconds,
                display_name,
            )
                .then(async () => {
                    // Save label map changes if any
                    if (onSaveLabelMap && Object.keys(labelEdits).length > 0) {
                        const map: Record<string, string> = {};
                        for (const [raw, display] of Object.entries(labelEdits)) {
                            map[raw] = display;
                        }
                        await onSaveLabelMap(instanceId, map);
                    }
                    if (!mounted_ref.current) return;
                    setSaved(true);
                    saved_timeout_ref.current = setTimeout(() => {
                        if (mounted_ref.current) {
                            setSaved(false);
                        }
                    }, 1500);
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
        ],
    );

    return (
        <form
            onSubmit={handle_submit}
            className="ad-body-form"
            data-testid={`settings-form-${instanceId}`}
        >
            <div className="ad-field">
                <label className="ad-label" htmlFor="displayName">
                    备注名<span className="ad-opt">显示用</span>
                </label>
                <input
                    type="text"
                    id="displayName"
                    name="displayName"
                    defaultValue={displayName ?? ""}
                    placeholder="例如：工作账号"
                    className="ad-input"
                />
            </div>
            {parameters.map((param) => (
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
                    ) : (
                        <div className="ad-secret-row">
                            <input
                                type={
                                    param.type === "secret"
                                        ? "password"
                                        : param.type === "integer"
                                          ? "number"
                                          : "text"
                                }
                                id={param.name}
                                name={param.name}
                                defaultValue={
                                    param.type === "secret"
                                        ? hasSecrets?.[param.name]
                                            ? SECRET_PLACEHOLDER
                                            : ""
                                        : (values[param.name] ?? param.defaultValue ?? "")
                                }
                                placeholder={param.placeholder}
                                required={param.required}
                                className={"ad-input" + (param.type === "secret" ? " mono" : "")}
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
                    )}
                    {typeof param.description === "string" && (
                        <p className="ad-hint">{param.description}</p>
                    )}
                </div>
            ))}
            {Object.keys(endpoints ?? {}).map((endpointName) => (
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
                            endpointName === "default" ? "接口地址" : `接口地址 (${endpointName})`
                        }
                        className="ad-input"
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
                                                    onChange={(e) => {
                                                        handle_label_edit(r.raw, e.target.value);
                                                    }}
                                                />
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
                </div>
            </div>
        </form>
    );
}

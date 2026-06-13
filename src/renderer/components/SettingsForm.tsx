import { useState, useCallback, useEffect, useRef } from "react";
import type { PluginParameterMetadata } from "../../shared/schemas/plugin-metadata";
import { Icon } from "./Icon";

interface LabelMapRow {
    raw: string;
    display: string;
}

interface SettingsFormProps {
    instanceId: string;
    name: string;
    parameters: PluginParameterMetadata[];
    values: Record<string, string>;
    hasSecrets?: Record<string, boolean>;
    endpoints?: Record<string, string | null>;
    endpointValues?: Record<string, string>;
    refreshIntervalSeconds: number;
    providerId?: string;
    onCookieLogin?: (instanceId: string) => Promise<boolean>;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => Promise<void>;
    onDuplicate?: (instanceId: string) => void;
    existingLabelMap?: Readonly<Record<string, string>>;
    onSaveLabelMap?: (instanceId: string, map: Record<string, string>) => Promise<void>;
}

export function SettingsForm({
    instanceId,
    name,
    parameters,
    values,
    hasSecrets,
    endpoints,
    endpointValues,
    refreshIntervalSeconds,
    providerId,
    onCookieLogin,
    onSave,
    onDuplicate,
    existingLabelMap,
    onSaveLabelMap,
}: SettingsFormProps) {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [loginLoading, setLoginLoading] = useState(false);
    const [labelMapExpanded, setLabelMapExpanded] = useState(false);
    const [labelRows, setLabelRows] = useState<LabelMapRow[]>([]);
    const [labelLoading, setLabelLoading] = useState(false);
    const [labelEdits, setLabelEdits] = useState<Record<string, string>>({});
    const mounted_ref = useRef(true);
    const saved_timeout_ref = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
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
                const state = await window.usageboard.plugin.getState(instanceId);
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
                    const raw: string = item.name;
                    if (seen.has(raw)) continue;
                    seen.add(raw);
                    rows.push({
                        raw,
                        display: existingLabelMap?.[raw] ?? raw,
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
                        if (val !== "***" && val !== "") {
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

            const intervalMinutes = Number(formData.get("refreshIntervalMinutes"));
            const intervalSeconds = Math.max(
                60,
                Math.min(172800, Math.round(intervalMinutes) * 60),
            );

            setSaving(true);
            setSaved(false);
            void onSave(instanceId, nonSecrets, secrets, endpointOverrides, intervalSeconds)
                .then(async () => {
                    // Save label map changes if any
                    if (onSaveLabelMap && Object.keys(labelEdits).length > 0) {
                        const map: Record<string, string> = {};
                        for (const [raw, display] of Object.entries(labelEdits)) {
                            if (display !== (existingLabelMap?.[raw] ?? raw)) {
                                map[raw] = display;
                            }
                        }
                        if (Object.keys(map).length > 0) {
                            await onSaveLabelMap(instanceId, map);
                        }
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
            instanceId,
            onSave,
            parameters,
            saving,
            existingLabelMap,
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
            <div className="cfg-label" style={{ fontSize: 14, marginBottom: 8 }}>
                {name}
            </div>
            {parameters.map((param) => (
                <div className="ad-field" key={param.name}>
                    <label className="cfg-label" htmlFor={param.name}>
                        {param.label}
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
                                            ? "***"
                                            : ""
                                        : (values[param.name] ?? param.defaultValue ?? "")
                                }
                                placeholder={param.placeholder}
                                required={param.required}
                                className={"ad-input" + (param.type === "secret" ? " mono" : "")}
                            />
                            {providerId === "mimo" &&
                                param.name === "SESSION_COOKIE" &&
                                onCookieLogin && (
                                    <button
                                        type="button"
                                        className="cf-secondary"
                                        disabled={loginLoading}
                                        onClick={() => {
                                            setLoginLoading(true);
                                            void onCookieLogin(instanceId).then((ok) => {
                                                setLoginLoading(false);
                                                if (ok) {
                                                    const el = document.getElementById(
                                                        param.name,
                                                    ) as HTMLInputElement | null;
                                                    if (el) el.value = "***";
                                                }
                                            });
                                        }}
                                    >
                                        {loginLoading ? "登录中..." : "网页登录"}
                                    </button>
                                )}
                        </div>
                    )}
                    {typeof param.description === "string" && (
                        <p className="ad-hint">{param.description}</p>
                    )}
                </div>
            ))}
            {Object.keys(endpoints ?? {}).map((endpointName) => (
                <div className="ad-field" key={endpointName}>
                    <label className="cfg-label">
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
                <label className="cfg-label">刷新间隔（分钟）</label>
                <input
                    type="number"
                    name="refreshIntervalMinutes"
                    min={1}
                    max={60}
                    defaultValue={Math.round(refreshIntervalSeconds / 60)}
                    data-testid={`settings-refresh-interval-${instanceId}`}
                    className="ad-input"
                />
                <p className="ad-hint">范围 1–2880 分钟</p>
            </div>
            {onSaveLabelMap && providerId && (
                <div className="ad-field">
                    <button
                        type="button"
                        className="cfg-label"
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
                <button
                    type="submit"
                    disabled={saving}
                    data-testid={`settings-save-btn-${instanceId}`}
                    className={"cf-save" + (saved ? " saved" : "")}
                >
                    {saving ? "保存中..." : saved ? "已保存" : "保存"}
                </button>
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
            </div>
        </form>
    );
}

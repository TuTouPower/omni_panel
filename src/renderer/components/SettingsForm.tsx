import { useState, useCallback } from "react";
import type { PluginParameterMetadata } from "../../shared/schemas/plugin-metadata";

interface SettingsFormProps {
    instanceId: string;
    name: string;
    parameters: PluginParameterMetadata[];
    values: Record<string, string>;
    hasSecrets?: Record<string, boolean>;
    endpoints?: Record<string, string | null>;
    endpointValues?: Record<string, string>;
    refreshIntervalSeconds: number;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => Promise<void>;
    onDuplicate?: (instanceId: string) => void;
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
    onSave,
    onDuplicate,
}: SettingsFormProps) {
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const handleSubmit = useCallback(
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
            const intervalSeconds = Math.max(60, Math.min(3600, Math.round(intervalMinutes) * 60));

            setSaving(true);
            setSaved(false);
            void onSave(instanceId, nonSecrets, secrets, endpointOverrides, intervalSeconds)
                .then(() => {
                    setSaved(true);
                    setTimeout(() => {
                        setSaved(false);
                    }, 1500);
                })
                .finally(() => {
                    setSaving(false);
                });
        },
        [endpoints, instanceId, onSave, parameters, saving],
    );

    return (
        <form
            onSubmit={handleSubmit}
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
                    )}
                    {typeof param["description"] === "string" && (
                        <p className="ad-hint">{param["description"]}</p>
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
                <p className="ad-hint">范围 1–60 分钟</p>
            </div>
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

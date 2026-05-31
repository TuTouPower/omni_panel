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
            className="space-y-4"
            data-testid={`settings-form-${instanceId}`}
        >
            <h3 className="text-sm font-semibold">{name}</h3>
            {parameters.map((param) => (
                <label key={param.name} className="block space-y-1">
                    <span className="text-xs text-[var(--muted-foreground)]">{param.label}</span>
                    {param.type === "boolean" ? (
                        <input
                            type="checkbox"
                            name={param.name}
                            defaultChecked={values[param.name] === "true"}
                            className="h-4 w-4"
                        />
                    ) : param.type === "choice" ? (
                        <select
                            name={param.name}
                            defaultValue={values[param.name] ?? param.defaultValue ?? ""}
                            required={param.required}
                            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
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
                            className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                        />
                    )}
                    {typeof param["description"] === "string" && (
                        <p className="text-xs text-[var(--muted-foreground)]">
                            {param["description"]}
                        </p>
                    )}
                </label>
            ))}
            {Object.keys(endpoints ?? {}).map((endpointName) => (
                <label key={endpointName} className="block space-y-1">
                    <span className="text-xs text-[var(--muted-foreground)]">
                        {endpointName === "default" ? "接口地址" : `接口地址 (${endpointName})`}
                    </span>
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
                        className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                    />
                </label>
            ))}
            <label className="block space-y-1">
                <span className="text-xs text-[var(--muted-foreground)]">刷新间隔（分钟）</span>
                <input
                    type="number"
                    name="refreshIntervalMinutes"
                    min={1}
                    max={60}
                    defaultValue={Math.round(refreshIntervalSeconds / 60)}
                    data-testid={`settings-refresh-interval-${instanceId}`}
                    className="w-full rounded-[var(--radius)] border border-[var(--border)] bg-transparent px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-[var(--ring)]"
                />
                <p className="text-xs text-[var(--muted-foreground)]">范围 1–60 分钟</p>
            </label>
            <div className="flex gap-2">
                <button
                    type="submit"
                    disabled={saving}
                    data-testid={`settings-save-btn-${instanceId}`}
                    className={`rounded-[var(--radius)] px-4 py-1.5 text-sm ${
                        saved
                            ? "bg-green-600 text-white"
                            : "bg-[var(--primary)] text-[var(--primary-foreground)]"
                    }`}
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
                        className="rounded-[var(--radius)] border border-[var(--border)] px-4 py-1.5 text-sm"
                    >
                        复制
                    </button>
                )}
            </div>
        </form>
    );
}

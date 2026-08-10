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
import { Button } from "./ui/Button";
import { Checkbox } from "./ui/Checkbox";
import { Input } from "./ui/Input";
import { Select } from "./ui/Select";
import { Switch } from "./ui/Switch";
import { DeviceLoginSection } from "./DeviceLoginSection";
import { WebLoginSection } from "./WebLoginSection";
import { SessionSection } from "./SessionSection";
import { SecretInput } from "./SecretInput";
import type { ResolvedAuthMethod } from "../lib/auth-flow-registry";
import type { AuthDescriptor } from "../../shared/schemas/auth";
import { format_cookie_login_error, poll_cookie_login } from "../lib/cookie_login_poll";

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
    authMethod?: ResolvedAuthMethod | undefined;
    /** t157: manifest auth descriptor used to render dedicated auth sections. */
    authDescriptor?: AuthDescriptor | null | undefined;
    /** Session login metadata from the manifest, when no auth descriptor exists. */
    loginUrl?: string | undefined;
    displayName?: string | undefined;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
        displayName?: string,
    ) => Promise<void>;
    onDuplicate?: ((instanceId: string) => void | Promise<void>) | undefined;
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
    authMethod,
    authDescriptor,
    loginUrl,
    displayName,
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
    const [duplicating, setDuplicating] = useState(false);
    const [saved, setSaved] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
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

    useEffect(() => {
        if (!providerId || !onSaveLabelMap) return;
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
    }, [instanceId, providerId, existingLabelMap, onSaveLabelMap]);

    const handle_label_edit = (raw: string, value: string) => {
        setLabelEdits((prev) => ({ ...prev, [raw]: value }));
    };

    const perform_save = useCallback(
        async (
            nonSecrets: Record<string, string>,
            secrets: Record<string, string>,
            endpointOverrides: Record<string, string>,
            intervalSeconds: number,
            displayName?: string,
            options?: { refresh?: boolean },
        ): Promise<boolean> => {
            setSaving(true);
            setSaved(false);
            setSaveError(null);
            try {
                await onSave(
                    instanceId,
                    nonSecrets,
                    secrets,
                    endpointOverrides,
                    intervalSeconds,
                    displayName,
                );
                if (onSaveLabelMap && Object.keys(labelEdits).length > 0) {
                    const map: Record<string, string> = {};
                    for (const [raw, display] of Object.entries(labelEdits)) {
                        map[raw] = display;
                    }
                    await onSaveLabelMap(instanceId, map);
                }
                if (providerId && onForcePercentChange && force_percent_local !== forcePercent) {
                    await onForcePercentChange(providerId, force_percent_local);
                }
                if (!mounted_ref.current) return true;
                if (Object.keys(secrets).length > 0) {
                    set_loaded_secrets((prev) => ({ ...prev, ...secrets }));
                }
                setSaved(true);
                saved_timeout_ref.current = setTimeout(() => {
                    if (mounted_ref.current) {
                        setSaved(false);
                    }
                }, 1500);
                if (options?.refresh) {
                    void window.usageboard.connector.refresh(instanceId);
                }
                return true;
            } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : String(err);
                if (mounted_ref.current) {
                    setSaveError(msg);
                }
                return false;
            } finally {
                if (mounted_ref.current) {
                    setSaving(false);
                }
            }
        },
        [
            instanceId,
            onSave,
            labelEdits,
            onSaveLabelMap,
            providerId,
            onForcePercentChange,
            force_percent_local,
            forcePercent,
        ],
    );

    const handle_session_login = useCallback(async () => {
        try {
            await poll_cookie_login(instanceId);
        } catch (error: unknown) {
            throw new Error(format_cookie_login_error(error));
        }
        const loaded = await window.usageboard.config.getSecrets(instanceId);
        if (!mounted_ref.current) return;
        set_loaded_secrets(loaded);
        set_secret_values(loaded);
        void window.usageboard.connector.refresh(instanceId);
    }, [instanceId]);

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

            void perform_save(
                nonSecrets,
                secrets,
                endpointOverrides,
                intervalSeconds,
                display_name,
            );
        },
        [
            endpoints,
            followGlobal,
            parameters,
            saving,
            syncInterval,
            secret_values,
            loaded_secrets,
            perform_save,
        ],
    );

    const supports_oauth_device_section =
        authMethod === "oauth_device" &&
        providerId &&
        (providerId === "grok" || providerId === "kimi");
    const supports_web_login_section = authMethod === "web_login" && !!authDescriptor?.login_url;
    const supports_session_section = authMethod === "session";
    const has_dedicated_auth_section = [
        supports_oauth_device_section,
        supports_web_login_section,
        supports_session_section,
    ].some(Boolean);
    const web_login_url = authDescriptor?.login_url ?? "";
    const auth_secret_name = parameters.find((p) => p.type === "secret")?.name ?? "OAUTH_TOKEN";

    const visible_parameters = parameters.filter(
        (param) =>
            (providerId !== "opencode_go" || param.name !== "ACCOUNT_LABEL") &&
            !(has_dedicated_auth_section && param.type === "secret"),
    );

    return (
        <form
            onSubmit={handle_submit}
            className="flex flex-col gap-3"
            data-testid={`settings-form-${instanceId}`}
        >
            <div className="flex flex-col gap-1.5">
                <label
                    className="text-label-md font-semibold text-[var(--color-on-surface-variant)]"
                    htmlFor="displayName"
                >
                    备注
                    <span className="ml-1 text-label-md text-[var(--color-on-surface-muted)]">
                        显示用
                    </span>
                </label>
                <Input
                    type="text"
                    id="displayName"
                    name="displayName"
                    defaultValue={displayName ?? ""}
                    placeholder="例如：工作账号"
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                />
            </div>
            {supports_oauth_device_section && (
                <DeviceLoginSection
                    vendor={providerId}
                    instance_id={instanceId}
                    secret_name={auth_secret_name}
                    onSecrets={async (secrets) => {
                        const ok = await perform_save(
                            {},
                            secrets,
                            endpointValues ?? {},
                            refreshIntervalSeconds,
                            displayName,
                            { refresh: true },
                        );
                        if (!ok) return;
                        const loaded = await window.usageboard.config
                            .getSecrets(instanceId)
                            .catch(() => ({}));
                        if (mounted_ref.current) {
                            set_loaded_secrets(loaded);
                            set_secret_values(loaded);
                        }
                    }}
                />
            )}
            {supports_web_login_section && (
                <WebLoginSection
                    provider={providerId ?? ""}
                    login_url={web_login_url}
                    secret_name={auth_secret_name}
                    value={secret_values[auth_secret_name] ?? ""}
                    onChange={(value) => {
                        set_secret_values((prev) => ({ ...prev, [auth_secret_name]: value }));
                    }}
                    instance_id={instanceId}
                    onSecrets={async (secrets) => {
                        const ok = await perform_save(
                            {},
                            secrets,
                            endpointValues ?? {},
                            refreshIntervalSeconds,
                            displayName,
                            { refresh: true },
                        );
                        if (!ok) return;
                        const loaded = await window.usageboard.config
                            .getSecrets(instanceId)
                            .catch(() => ({}));
                        if (mounted_ref.current) {
                            set_loaded_secrets(loaded);
                            set_secret_values(loaded);
                        }
                    }}
                    onSaved={async () => {
                        const loaded = await window.usageboard.config
                            .getSecrets(instanceId)
                            .catch(() => ({}));
                        if (mounted_ref.current) {
                            set_loaded_secrets(loaded);
                            set_secret_values(loaded);
                        }
                        void window.usageboard.connector.refresh(instanceId);
                    }}
                />
            )}
            {supports_session_section && (
                <SessionSection
                    secret_name={auth_secret_name}
                    value={secret_values[auth_secret_name] ?? ""}
                    onChange={(v) => {
                        set_secret_values((prev) => ({ ...prev, [auth_secret_name]: v }));
                    }}
                    onLogin={loginUrl ? handle_session_login : undefined}
                />
            )}
            {visible_parameters.map((param) => (
                <div className="flex flex-col gap-1.5" key={param.name}>
                    <label
                        className="text-label-md font-semibold text-[var(--color-on-surface-variant)]"
                        htmlFor={param.name}
                    >
                        {param["label@zh-Hans"] ?? param.label}
                    </label>
                    {param.type === "boolean" ? (
                        <Checkbox
                            id={param.name}
                            name={param.name}
                            defaultChecked={values[param.name] === "true"}
                        />
                    ) : param.type === "choice" ? (
                        <Select
                            id={param.name}
                            name={param.name}
                            defaultValue={values[param.name] ?? param.defaultValue ?? ""}
                            required={param.required}
                        >
                            {param.options?.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                    {opt.label}
                                </option>
                            ))}
                        </Select>
                    ) : param.type === "secret" ? (
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
                    ) : (
                        <Input
                            type={param.type === "integer" ? "number" : "text"}
                            id={param.name}
                            name={param.name}
                            defaultValue={values[param.name] ?? param.defaultValue ?? ""}
                            placeholder={param.placeholder}
                            required={param.required}
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                    )}
                    {typeof param.description === "string" && (
                        <p className="text-body-sm text-[var(--color-on-surface-muted)]">
                            {param.description}
                        </p>
                    )}
                </div>
            ))}
            {providerId !== "grok" &&
                Object.keys(endpoints ?? {}).map((endpointName) => (
                    <div className="flex flex-col gap-1.5" key={endpointName}>
                        <label className="text-label-md font-semibold text-[var(--color-on-surface-variant)]">
                            {endpointName === "default" ? "接口地址" : `接口地址 (${endpointName})`}
                        </label>
                        <Input
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
                            spellCheck={false}
                            autoCorrect="off"
                            autoCapitalize="off"
                        />
                    </div>
                ))}
            <div className="flex flex-col gap-1.5">
                <label className="text-label-md font-semibold text-[var(--color-on-surface-variant)]">
                    刷新
                </label>
                {manualRefreshOnly ? (
                    <p
                        className="text-body-sm text-[var(--color-on-surface-muted)]"
                        data-testid={`settings-manual-only-${instanceId}`}
                    >
                        仅手动刷新（刷新时会消耗一次 API 配额）
                    </p>
                ) : (
                    <>
                        <div className="mt-1 flex items-center gap-2">
                            <span className="text-body-md text-[var(--color-on-surface)]">
                                跟随全局自动刷新间隔
                            </span>
                            <Switch
                                checked={followGlobal}
                                data-on={followGlobal ? "1" : "0"}
                                type="button"
                                onChange={() => {
                                    setFollowGlobal((v) => !v);
                                }}
                                data-testid={`settings-follow-global-${instanceId}`}
                                aria-label="跟随全局自动刷新间隔"
                            />
                        </div>
                        {followGlobal ? (
                            <p
                                className="text-body-sm text-[var(--color-on-surface-muted)]"
                                data-testid={`settings-global-label-${instanceId}`}
                            >
                                当前全局为「{globalIntervalLabel}」自动刷新
                            </p>
                        ) : (
                            <div className="mt-1">
                                <Select
                                    className="w-auto"
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
                                </Select>
                            </div>
                        )}
                    </>
                )}
            </div>
            {providerId && onForcePercentChange && (
                <div className="flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                        <span className="text-body-md text-[var(--color-on-surface)]">
                            用量数字统一为百分比
                        </span>
                        <Switch
                            checked={force_percent_local}
                            data-on={force_percent_local ? "1" : "0"}
                            type="button"
                            onChange={() => {
                                set_force_percent_local((v) => !v);
                            }}
                            data-testid={`settings-force-percent-${instanceId}`}
                            aria-label="用量数字统一为百分比"
                        />
                    </div>
                    <p className="text-body-sm text-[var(--color-on-surface-muted)]">
                        该厂商下所有账号用量统一显示为百分比
                    </p>
                </div>
            )}
            {onSaveLabelMap && providerId && (
                <div className="flex flex-col gap-1.5">
                    <label className="text-label-md font-semibold text-[var(--color-on-surface-variant)]">
                        数据标签映射
                    </label>
                    <div className="mt-2">
                        {labelLoading ? (
                            <div className="text-body-sm text-[var(--color-on-surface-muted)]">
                                加载标签数据…
                            </div>
                        ) : labelRows.length === 0 ? (
                            <div className="text-body-sm text-[var(--color-on-surface-muted)]">
                                暂无可映射的数据标签
                            </div>
                        ) : (
                            <>
                                <div className="mb-2 flex items-center gap-3 px-0.5 text-label-md font-semibold uppercase tracking-wide text-[var(--color-on-surface-muted)]">
                                    <span className="min-w-0 flex-1">原始标签</span>
                                    <span className="min-w-0 flex-1">显示名称</span>
                                </div>
                                {labelRows.map((r) => {
                                    const v = labelEdits[r.raw] ?? r.display;
                                    const provider_watched = watchedMetrics?.[providerId];
                                    const watched = r.account_keys.every(
                                        (k) => provider_watched?.[k]?.includes(r.raw) ?? false,
                                    );
                                    return (
                                        <div className="flex items-center gap-2" key={r.raw}>
                                            <code className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-md bg-[var(--color-surface-raised)] px-2 py-1.5 font-[var(--font-code-md)] text-label-md text-[var(--color-on-surface-variant)]">
                                                {r.raw}
                                            </code>
                                            <span className="shrink-0 text-[var(--color-on-surface-muted)]">
                                                <Icon name="chevron" size={14} />
                                            </span>
                                            <Input
                                                className="h-8 min-w-0 flex-1 font-[var(--font-code-md)] text-label-md"
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
                                                <Button
                                                    variant="icon"
                                                    size="sm"
                                                    className="h-7 w-7 shrink-0 p-0"
                                                    title="监控该数据标签的即将重置"
                                                    aria-label="监控该数据标签的即将重置"
                                                    aria-pressed={watched}
                                                    type="button"
                                                    onClick={() => {
                                                        onToggleWatched(r.raw);
                                                    }}
                                                >
                                                    <Icon
                                                        name="bell"
                                                        size={14}
                                                        style={{ opacity: watched ? 1 : 0.35 }}
                                                    />
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </>
                        )}
                    </div>
                </div>
            )}
            <div className="flex justify-end gap-2 border-t border-[var(--color-hairline)] pt-3">
                {onDuplicate && (
                    <Button
                        variant="secondary"
                        size="sm"
                        type="button"
                        data-testid={`settings-duplicate-btn-${instanceId}`}
                        disabled={duplicating}
                        onClick={() => {
                            if (duplicating) return;
                            setDuplicating(true);
                            setSaveError(null);
                            void Promise.resolve()
                                .then(() => onDuplicate(instanceId))
                                .catch((err: unknown) => {
                                    if (!mounted_ref.current) return;
                                    setSaveError(err instanceof Error ? err.message : String(err));
                                })
                                .finally(() => {
                                    if (mounted_ref.current) setDuplicating(false);
                                });
                        }}
                    >
                        复制
                    </Button>
                )}
                <Button
                    variant="primary"
                    type="submit"
                    disabled={saving}
                    data-testid={`settings-save-btn-${instanceId}`}
                    className={saved ? "bg-[var(--color-success)]" : undefined}
                >
                    {saving ? "保存中..." : saved ? "已保存" : "保存"}
                </Button>
                {saveError ? (
                    <span className="text-body-sm text-[var(--color-error)]" role="alert">
                        {saveError}
                    </span>
                ) : null}
            </div>
        </form>
    );
}

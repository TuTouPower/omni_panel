import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { use_config } from "../hooks/use-config";
import { useTheme } from "../lib/theme";
import { SettingsForm } from "../components/SettingsForm";
import { CpaConnectorSettings } from "../components/CpaConnectorSettings";
import { Icon, VendorMark } from "../components/Icon";
import type { PluginInfo } from "../../shared/types/ipc";
import type {
    PluginConfiguration,
    AppConfiguration,
    MainPanelMode,
    FloatingHeightMode,
    UsageBarColorScheme,
    UsageBarStyle,
} from "../../shared/types/config";
import {
    USAGE_LABEL_MAP_MAX_ENTRIES,
    USAGE_LABEL_MAP_MAX_KEY_LENGTH,
    USAGE_LABEL_MAP_MAX_TEXT_LENGTH,
    USAGE_LABEL_MAP_MAX_VALUE_LENGTH,
} from "../../shared/types/config";
import type { UsageProvider } from "../../shared/schemas/plugin-output";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { relative_time } from "../lib/utils";
import { createLogger } from "../../shared/lib/logger";
import { redact_config_raw } from "../../shared/lib/config_redaction";
import logo from "../assets/logo.png";
import package_json from "../../../package.json";

/* ── types ── */
interface DialogState {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
}

interface ProviderAccountGroup {
    provider: UsageProvider | "connector";
    label: string;
    plugins: (PluginConfiguration & { pluginInfo?: PluginInfo | undefined })[];
}

/* ── constants ── */
const NAV_ITEMS = [
    { id: "general", label: "常规", icon: "gear" },
    { id: "accounts", label: "账号", icon: "inbox" },
    { id: "datasource", label: "数据源", icon: "globe", cpaOnly: true },
    { id: "appearance", label: "外观", icon: "palette" },
    { id: "notify", label: "通知", icon: "bell" },
    { id: "data", label: "数据与隐私", icon: "shield" },
    { id: "about", label: "关于", icon: "info" },
] as const;

const ACCENTS = ["#3d7afd", "#6f5cf6", "#0ea5a3", "#f5772f", "#e23744"];
const BAR_COLOR_SCHEMES: {
    value: UsageBarColorScheme;
    title: string;
    badge?: string;
    sub: string;
    swatch: string[];
}[] = [
    {
        value: "risk-current",
        title: "风险色：仅当前用量",
        badge: "默认",
        sub: "只看当前用量比例判断颜色，不依赖重置时间。",
        swatch: [
            "var(--risk-green)",
            "var(--risk-yellow)",
            "var(--risk-orange)",
            "var(--risk-red)",
        ],
    },
    {
        value: "risk-projected",
        title: "风险色：带投影预测",
        sub: "按当前速度预测窗口结束用量；无法预测时回退到仅当前用量。",
        swatch: [
            "var(--risk-green)",
            "var(--risk-yellow)",
            "var(--risk-orange)",
            "var(--risk-red)",
        ],
    },
    {
        value: "nine-cycle",
        title: "彩色区分：九色循环",
        sub: "按位置循环九色，只做视觉区分，不表达风险。",
        swatch: ["#5B8CFF", "#8B72F8", "#46C7C7", "#7EA2FF", "#A18CFF"],
    },
];
const MAIN_PANEL_MODE_LABELS = ["跟随系统推荐", "弹出面板", "浮动窗口"] as const;
const FLOATING_HEIGHT_MODE_LABELS = ["保持窗口大小", "跟随内容变化"] as const;
const BAR_STYLE_LABELS = ["细线型", "粗胶囊型"] as const;
const log = createLogger("renderer:settings-view");
const should_log_raw = import.meta.env.DEV;

function main_panel_mode_label_to_value(label: string): MainPanelMode {
    if (label === "弹出面板") return "popup";
    if (label === "浮动窗口") return "floating";
    return "system";
}

function main_panel_mode_value_to_label(value: MainPanelMode | undefined): string {
    if (value === "popup") return "弹出面板";
    if (value === "floating") return "浮动窗口";
    return "跟随系统推荐";
}

function floating_height_mode_label_to_value(label: string): FloatingHeightMode {
    return label === "跟随内容变化" ? "followContent" : "fixed";
}

function floating_height_mode_value_to_label(value: FloatingHeightMode | undefined): string {
    return value === "followContent" ? "跟随内容变化" : "保持窗口大小";
}

function bar_style_label_to_value(label: string): UsageBarStyle {
    return label === "粗胶囊型" ? "capsule" : "thin";
}

function format_usage_label_map(value: Readonly<Record<string, string>> | undefined): string {
    return Object.entries(value ?? {})
        .map(([source, target]) => `${source}=${target}`)
        .join("\n");
}

function parse_usage_label_map(value: string): Record<string, string> | undefined {
    if (value.length > USAGE_LABEL_MAP_MAX_TEXT_LENGTH) return undefined;
    const entries = value
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line): [string, string] | null => {
            const separator = line.indexOf("=");
            if (separator <= 0) return null;
            const source = line.slice(0, separator).trim();
            const target = line.slice(separator + 1).trim();
            if (
                source.length === 0 ||
                target.length === 0 ||
                source.length > USAGE_LABEL_MAP_MAX_KEY_LENGTH ||
                target.length > USAGE_LABEL_MAP_MAX_VALUE_LENGTH
            ) {
                return null;
            }
            return [source, target];
        })
        .filter((entry): entry is [string, string] => entry !== null);

    return entries.length > 0
        ? Object.fromEntries(entries.slice(0, USAGE_LABEL_MAP_MAX_ENTRIES))
        : undefined;
}

function override_account_label(key: string): string {
    const parts = key.split(":");
    return parts.length >= 3 ? parts.slice(2).join(":") : "账号";
}

/* ── helpers ── */
function Toggle({
    on,
    onClick,
    disabled,
}: {
    on: boolean;
    onClick?: () => void;
    disabled?: boolean;
}) {
    return (
        <button
            className="sw"
            data-on={on ? "1" : "0"}
            disabled={disabled}
            onClick={disabled ? undefined : onClick}
            type="button"
        >
            <i />
        </button>
    );
}

function SetRow({
    title,
    sub,
    children,
}: {
    title: string;
    sub?: string;
    children: React.ReactNode;
}) {
    return (
        <div className="set-row">
            <div className="sr-text">
                <div className="sr-title">{title}</div>
                {sub && <div className="sr-sub">{sub}</div>}
            </div>
            <div className="sr-ctrl">{children}</div>
        </div>
    );
}

function Select({
    value,
    onChange,
    options,
}: {
    value: string;
    onChange: (v: string) => void;
    options: string[];
}) {
    return (
        <select
            className="set-select"
            value={value}
            onChange={(e) => {
                onChange(e.target.value);
            }}
        >
            {options.map((o) => (
                <option key={o} value={o}>
                    {o}
                </option>
            ))}
        </select>
    );
}

function BarSchemeField({
    value,
    onChange,
}: {
    value: UsageBarColorScheme;
    onChange: (value: UsageBarColorScheme) => void;
}) {
    return (
        <div className="bsf-list">
            {BAR_COLOR_SCHEMES.map((scheme) => {
                const on = value === scheme.value;
                return (
                    <button
                        key={scheme.value}
                        className={`bsf-opt${on ? " on" : ""}`}
                        type="button"
                        onClick={() => {
                            onChange(scheme.value);
                        }}
                    >
                        <span className={`bsf-radio${on ? " on" : ""}`}>
                            <i />
                        </span>
                        <span className="bsf-text">
                            <span className="bsf-title-row">
                                <span className="bsf-title">{scheme.title}</span>
                                {scheme.badge && <span className="bsf-badge">{scheme.badge}</span>}
                            </span>
                            <span className="bsf-sub">{scheme.sub}</span>
                        </span>
                        <span className="bsf-swatch">
                            {scheme.swatch.map((color, idx) => (
                                <span
                                    key={`${scheme.value}-${String(idx)}`}
                                    className="bsf-dot"
                                    style={{ background: color }}
                                />
                            ))}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/* ── Add / Edit Account Dialog ── */
function AccountDialog({
    mode,
    instanceId,
    pluginName,
    pluginInfo,
    pluginConfig,
    pluginInfos,
    hasSecrets,
    onSave,
    onSaveSecrets,
    onRefresh,
    onSelectService,
    onCpa,
    onClose,
}: {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
    pluginInfo: PluginInfo | undefined;
    pluginConfig: PluginConfiguration | undefined;
    pluginInfos: PluginInfo[];
    hasSecrets: Record<string, boolean> | undefined;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => Promise<void>;
    onSaveSecrets: (instanceId: string, secrets: Record<string, string>) => Promise<void>;
    onRefresh: (instanceId: string) => Promise<void>;
    onSelectService: (instanceId: string, pluginName: string) => void;
    onCpa: () => void;
    onClose: () => void;
}) {
    const isEdit = mode === "edit";

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", h);
        return () => {
            window.removeEventListener("keydown", h);
        };
    }, [onClose]);

    return (
        <div className="acct-dialog-scrim" onMouseDown={onClose}>
            <div
                className="acct-dialog"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="acct-dialog-title"
            >
                <div className="ad-head">
                    <div className="ad-htext">
                        <div className="ad-title" id="acct-dialog-title">
                            {isEdit ? "编辑账号" : "添加账号"}
                        </div>
                        <div className="ad-sub">
                            {isEdit ? (pluginName ?? "新账号") : "选择要添加的服务"}
                        </div>
                    </div>
                    <button className="ad-close" onClick={onClose} title="关闭" type="button">
                        <Icon name="close" size={17} strokeWidth={2} />
                    </button>
                </div>

                <div className="ad-body">
                    {instanceId && pluginInfo && pluginConfig ? (
                        pluginInfo.source === "cpa" ? (
                            <CpaConnectorSettings
                                connector={pluginInfo}
                                config={{
                                    endpointOverrides: pluginConfig.endpointOverrides,
                                    parameterValues: pluginConfig.parameterValues,
                                    refreshIntervalSeconds: pluginConfig.refreshIntervalSeconds,
                                }}
                                hasSecrets={hasSecrets ?? {}}
                                onSave={async (
                                    nonSecrets,
                                    endpointOverrides,
                                    refreshIntervalSeconds,
                                ) => {
                                    await onSave(
                                        instanceId,
                                        nonSecrets,
                                        {},
                                        endpointOverrides,
                                        refreshIntervalSeconds,
                                    );
                                    onClose();
                                }}
                                onSaveSecrets={async (secrets) => {
                                    await onSaveSecrets(instanceId, secrets);
                                }}
                                onRefresh={async () => {
                                    await onRefresh(instanceId);
                                }}
                            />
                        ) : (
                            <SettingsForm
                                instanceId={instanceId}
                                name={pluginName ?? pluginInfo.displayName}
                                parameters={pluginInfo.metadata?.parameters ?? []}
                                values={pluginConfig.parameterValues}
                                hasSecrets={hasSecrets ?? {}}
                                endpoints={pluginInfo.metadata?.endpoints ?? {}}
                                endpointValues={pluginConfig.endpointOverrides}
                                refreshIntervalSeconds={pluginConfig.refreshIntervalSeconds}
                                onSave={async (...args) => {
                                    await onSave(...args);
                                    onClose();
                                }}
                            />
                        )
                    ) : mode === "add" && !instanceId ? (
                        <AddAccountPicker
                            pluginInfos={pluginInfos}
                            onSelect={onSelectService}
                            onCpa={onCpa}
                        />
                    ) : (
                        <div className="text-sm text-[var(--text-3)]">暂不支持在此添加新账号</div>
                    )}
                </div>
            </div>
        </div>
    );
}

const ADD_COMMON_SERVICES: { id: UsageProvider; label: string }[] = [
    { id: "claude", label: "Claude" },
    { id: "codex", label: "Codex" },
    { id: "gemini", label: "Gemini" },
    { id: "kimi", label: "Kimi" },
    { id: "deepseek", label: "DeepSeek" },
    { id: "tavily", label: "Tavily" },
    { id: "mimo", label: "MiMo" },
];

/* ── Add Account Picker ── */
function AddAccountPicker({
    pluginInfos,
    onSelect,
    onCpa,
}: {
    pluginInfos: PluginInfo[];
    onSelect: (instanceId: string, pluginName: string) => void;
    onCpa: () => void;
}) {
    const handleServiceClick = (provider: UsageProvider) => {
        // Find the first plugin instance that provides this provider
        const match = pluginInfos.find((p) => p.activeProviders.includes(provider) && p.enabled);
        if (match) {
            onSelect(match.instanceId, match.displayName);
        }
    };

    return (
        <div className="pick-body">
            <div className="set-group-label" style={{ marginTop: 0 }}>
                常用服务
            </div>
            <div className="pick-grid">
                {ADD_COMMON_SERVICES.map((s) => (
                    <button
                        className="pick-card"
                        key={s.id}
                        type="button"
                        onClick={() => {
                            handleServiceClick(s.id);
                        }}
                    >
                        <span className="pc-mark">
                            <VendorMark id={s.id} size={30} />
                        </span>
                        <span className="pc-name">{s.label}</span>
                    </button>
                ))}
            </div>
            <div className="set-group-label">高级方式</div>
            <button className="pick-adv" type="button" onClick={onCpa}>
                <span className="pa-icon">
                    <VendorMark id="cpa" size={24} />
                </span>
                <span className="pa-text">
                    <span className="pa-title-row">
                        <span className="pa-title">CPA Manager</span>
                        <span className="pa-badge">多服务商</span>
                    </span>
                    <span className="pa-desc">通过 CPA 批量获取多个 AI 服务商账号</span>
                </span>
                <span className="pa-chev">
                    <Icon name="chevron" size={18} />
                </span>
            </button>
        </div>
    );
}

/* ── Data Source List Page ── */
function DataSourceList({
    pluginInfos,
    config,
    onOpenDetail,
    onAdd,
}: {
    pluginInfos: PluginInfo[];
    config: AppConfiguration;
    onOpenDetail: () => void;
    onAdd: () => void;
}) {
    const cpaPlugin = pluginInfos.find((p) => p.source === "cpa");
    const cpaConfig = cpaPlugin
        ? config.plugins.find((p) => p.instanceId === cpaPlugin.instanceId)
        : undefined;
    const url = cpaConfig?.endpointOverrides["default"] ?? "";
    const snapshot = cpaPlugin?.snapshot;
    const accountsCount = snapshot?.status === "ready" ? snapshot.items.length : 0;
    const providers = cpaPlugin?.activeProviders ?? [];
    const lastSync =
        snapshot?.status === "ready"
            ? relative_time(snapshot.updatedAt)
            : snapshot?.status === "failed" && snapshot.updatedAt
              ? relative_time(snapshot.updatedAt)
              : "未同步";

    return (
        <>
            <div className="sp-head">
                <span className="sp-title">数据源</span>
                <button className="sp-action" onClick={onAdd} type="button">
                    <Icon name="plus" size={15} strokeWidth={2} />
                    添加数据源
                </button>
            </div>
            <div className="ds-list">
                {cpaPlugin ? (
                    <div
                        className="ds-card"
                        onClick={onOpenDetail}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onOpenDetail();
                            }
                        }}
                        role="button"
                        tabIndex={0}
                    >
                        <div className="ds-top">
                            <span className="ds-icon">
                                <VendorMark id="cpa" size={26} />
                            </span>
                            <div className="ds-head-text">
                                <div className="ds-title">CPA Manager</div>
                                <div className="ds-status">
                                    <span className="dsd" />
                                    状态：
                                    {snapshot?.status === "ready"
                                        ? "正常"
                                        : snapshot?.status === "failed"
                                          ? "异常"
                                          : "未连接"}
                                </div>
                            </div>
                            <div className="ds-actions">
                                <button
                                    className="ds-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        void window.usageboard.plugin.refresh(cpaPlugin.instanceId);
                                    }}
                                    type="button"
                                >
                                    同步
                                </button>
                                <button
                                    className="ds-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenDetail();
                                    }}
                                    type="button"
                                >
                                    编辑
                                </button>
                                <button
                                    className="ds-btn"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onOpenDetail();
                                    }}
                                    type="button"
                                    title="更多"
                                >
                                    <Icon name="more" size={15} />
                                </button>
                            </div>
                        </div>
                        <div className="ds-meta">
                            {url && <div className="dm-line mono">{url}</div>}
                            <div className="dm-line">
                                发现 <b>{String(accountsCount)}</b> 个账号，覆盖{" "}
                                <b>{String(providers.length)}</b> 个服务商
                            </div>
                            <div className="dm-line dm-faint">上次同步：{lastSync}</div>
                        </div>
                        {providers.length > 0 && (
                            <div className="ds-covers">
                                <span className="dc-label">覆盖服务商</span>
                                <span className="dc-icons">
                                    {providers.map((id) => (
                                        <VendorMark key={id} id={id} size={16} />
                                    ))}
                                </span>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="text-sm text-[var(--text-3)] py-4">
                        暂无数据源。点击上方按钮添加 CPA Manager。
                    </div>
                )}
            </div>
        </>
    );
}

/* ── CPA Detail Page (dual-pane) ── */
function CpaDetailPage({
    pluginInfos,
    config,
    hasSecrets,
    onBack,
    onSave,
    onSaveSecrets,
    onRefresh,
    onDelete,
    saveConfig,
}: {
    pluginInfos: PluginInfo[];
    config: AppConfiguration;
    hasSecrets: Record<string, Record<string, boolean>>;
    onBack: () => void;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => Promise<void>;
    onSaveSecrets: (instanceId: string, secrets: Record<string, string>) => Promise<void>;
    onRefresh: (instanceId: string) => Promise<void>;
    onDelete: (instanceId: string) => Promise<void>;
    saveConfig: (config: AppConfiguration) => Promise<void>;
}) {
    const cpaPlugin = pluginInfos.find((p) => p.source === "cpa");
    const cpaConfig = cpaPlugin
        ? config.plugins.find((p) => p.instanceId === cpaPlugin.instanceId)
        : undefined;

    if (!cpaPlugin || !cpaConfig) {
        return <div className="text-sm text-[var(--text-3)] py-4">未找到 CPA Manager 配置。</div>;
    }

    return (
        <>
            <div className="sp-head">
                <div className="sp-crumb">
                    <span
                        className="sp-crumb-link"
                        onClick={onBack}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onBack();
                            }
                        }}
                        role="button"
                        tabIndex={0}
                    >
                        数据源
                    </span>
                    <span className="cc-sep">
                        <Icon name="chevron" size={15} />
                    </span>
                    <span className="cc-cur">CPA Manager</span>
                </div>
            </div>
            <div className="set-content" style={{ paddingRight: 0 }}>
                <CpaConnectorSettings
                    connector={cpaPlugin}
                    config={{
                        endpointOverrides: cpaConfig.endpointOverrides,
                        parameterValues: cpaConfig.parameterValues,
                        refreshIntervalSeconds: cpaConfig.refreshIntervalSeconds,
                        enabled: cpaConfig.enabled,
                    }}
                    enabled={cpaConfig.enabled}
                    hasSecrets={hasSecrets[cpaPlugin.instanceId] ?? {}}
                    onSave={async (nonSecrets, endpointOverrides, refreshIntervalSeconds) => {
                        await onSave(
                            cpaPlugin.instanceId,
                            nonSecrets,
                            {},
                            endpointOverrides,
                            refreshIntervalSeconds,
                        );
                    }}
                    onSaveSecrets={async (secrets) => {
                        await onSaveSecrets(cpaPlugin.instanceId, secrets);
                    }}
                    onToggleEnabled={(nextEnabled) => {
                        void saveConfig({
                            ...config,
                            plugins: config.plugins.map((pl) =>
                                pl.instanceId === cpaPlugin.instanceId
                                    ? { ...pl, enabled: nextEnabled }
                                    : pl,
                            ),
                        });
                    }}
                    onRefresh={async () => {
                        await onRefresh(cpaPlugin.instanceId);
                    }}
                    onRemove={async () => {
                        await onDelete(cpaPlugin.instanceId);
                    }}
                />
            </div>
        </>
    );
}

const CPA_SCOPE: UsageProvider[] = ["claude", "codex", "gemini", "antigravity", "kimi"];

/* ── CPA Add Data Source Dialog ── */
function CpaAddDialog({ onClose }: { onClose: () => void }) {
    const [url, setUrl] = useState("");
    const [key, setKey] = useState("");
    const [showKey, setShowKey] = useState(false);
    const [scope, setScope] = useState<Set<UsageProvider>>(() => new Set(CPA_SCOPE));

    const toggleScope = (id: UsageProvider) => {
        setScope((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const canSave = url.trim().length > 0 && key.trim().length > 0;

    return (
        <div className="acct-dialog-scrim" onMouseDown={onClose}>
            <div
                className="acct-dialog wide"
                onMouseDown={(e) => {
                    e.stopPropagation();
                }}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cpa-dialog-title"
            >
                <div className="ad-head">
                    <div className="ad-htext">
                        <div className="ad-title" id="cpa-dialog-title">
                            添加 CPA Manager
                        </div>
                        <div className="ad-sub">批量接入多个服务商账号</div>
                    </div>
                    <button className="ad-close" onClick={onClose} title="关闭" type="button">
                        <Icon name="close" size={17} strokeWidth={2} />
                    </button>
                </div>
                <div className="ad-body">
                    <div className="ad-field">
                        <label className="ad-label">CPA-Manager URL</label>
                        <input
                            className="ad-input mono"
                            value={url}
                            onChange={(e) => {
                                setUrl(e.target.value);
                            }}
                            placeholder="https://cpa.example.com"
                            autoFocus
                        />
                    </div>
                    <div className="ad-field">
                        <label className="ad-label">管理密钥</label>
                        <div className="ad-key">
                            <input
                                className="ad-input mono"
                                type={showKey ? "text" : "password"}
                                value={key}
                                onChange={(e) => {
                                    setKey(e.target.value);
                                }}
                                placeholder="cpa_sk_..."
                            />
                            <button
                                className="ad-eye"
                                onClick={() => {
                                    setShowKey(!showKey);
                                }}
                                title={showKey ? "隐藏" : "显示"}
                                type="button"
                            >
                                <Icon name={showKey ? "eye_off" : "eye"} size={16} />
                            </button>
                        </div>
                    </div>
                    <div className="ad-field">
                        <label className="ad-label">同步范围</label>
                        <div className="scope-list">
                            {CPA_SCOPE.map((id) => (
                                <div className="scope-item" key={id}>
                                    <VendorMark id={id} size={20} />
                                    <span className="si-name">{PROVIDER_LABELS[id]}</span>
                                    <Toggle
                                        on={scope.has(id)}
                                        onClick={() => {
                                            toggleScope(id);
                                        }}
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
                <div className="ad-foot">
                    <button className="ad-test" type="button">
                        <Icon name="refresh" size={14} />
                        测试连接
                    </button>
                    <div className="ad-foot-r">
                        <button className="ad-btn ghost" onClick={onClose} type="button">
                            取消
                        </button>
                        <button
                            className={`ad-btn primary${canSave ? "" : " disabled"}`}
                            disabled={!canSave}
                            type="button"
                        >
                            保存并同步
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Title Bar (frameless window controls) ── */
function TitleBar() {
    return (
        <div className="settings-titlebar">
            <span className="st-title">设置</span>
            <div className="st-controls">
                <button
                    className="st-btn"
                    onClick={() => {
                        window.usageboard.settings.minimize();
                    }}
                    title="最小化"
                    type="button"
                >
                    <svg width="10" height="1" viewBox="0 0 10 1">
                        <rect width="10" height="1" fill="currentColor" />
                    </svg>
                </button>
                <button
                    className="st-btn"
                    onClick={() => {
                        window.usageboard.settings.maximize();
                    }}
                    title="最大化"
                    type="button"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <rect
                            x="0.5"
                            y="0.5"
                            width="9"
                            height="9"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1"
                        />
                    </svg>
                </button>
                <button
                    className="st-btn close"
                    onClick={() => {
                        window.usageboard.settings.close();
                    }}
                    title="关闭"
                    type="button"
                >
                    <svg width="10" height="10" viewBox="0 0 10 10">
                        <path
                            d="M0.5 0.5L9.5 9.5M9.5 0.5L0.5 9.5"
                            stroke="currentColor"
                            strokeWidth="1.2"
                        />
                    </svg>
                </button>
            </div>
        </div>
    );
}

/* ── Main View ── */
export function SettingsView() {
    useTheme();
    const version = package_json.version;
    const { config, hasSecrets, loading, error, save, saveSecrets } = use_config();
    const [pluginInfos, setPluginInfos] = useState<PluginInfo[]>([]);
    const [section, setSection] = useState("general");
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [showCpaAdd, setShowCpaAdd] = useState(false);
    const [dsView, setDsView] = useState<"list" | "detail">("list");
    const [usage_label_map_text, set_usage_label_map_text] = useState("");
    const usage_label_map_dirty_ref = useRef(false);

    useEffect(() => {
        if (should_log_raw && config) {
            log.debug("settings config raw", { config: redact_config_raw(config) });
        }
    }, [config]);

    useEffect(() => {
        if (usage_label_map_dirty_ref.current) return;
        set_usage_label_map_text(format_usage_label_map(config?.usageLabelMap));
    }, [config?.usageLabelMap]);

    const save_config = useCallback(
        async (payload: AppConfiguration) => {
            if (should_log_raw) {
                log.debug("settings save payload raw", { payload: redact_config_raw(payload) });
            }
            await save(payload);
        },
        [save],
    );

    // CPA detection: show 数据源 nav only when CPA connector exists
    const hasCpa = pluginInfos.some((p) => p.source === "cpa");

    // Reset data source view when leaving datasource section
    useEffect(() => {
        if (section !== "datasource") setDsView("list");
    }, [section]);

    // Listen for navigate events from main panel (edit account)
    useEffect(() => {
        const unsub = window.usageboard.event.onSettingsNavigate((context) => {
            setSection("accounts");
            if (context.instanceId) {
                setDialog({ mode: "edit", instanceId: context.instanceId, pluginName: undefined });
            }
        });
        return unsub;
    }, []);

    // Phase 21.5: group plugins by provider for the accounts page
    const account_groups = useMemo<ProviderAccountGroup[]>(() => {
        if (!config) return [];
        const map = new Map<string, ProviderAccountGroup>();
        for (const p of config.plugins) {
            const info = pluginInfos.find((pi) => pi.instanceId === p.instanceId);
            if (info?.source === "cpa") {
                for (const prov of info.activeProviders) {
                    const key = `provider:${prov}`;
                    let entry = map.get(key);
                    if (!entry) {
                        entry = {
                            provider: prov,
                            label: PROVIDER_LABELS[prov],
                            plugins: [],
                        };
                        map.set(key, entry);
                    }
                    entry.plugins.push({ ...p, pluginInfo: info });
                }
            } else {
                const prov = info?.activeProviders[0];
                const key = prov ? `provider:${prov}` : `connector:${p.instanceId}`;
                let entry = map.get(key);
                if (!entry) {
                    entry = {
                        provider: prov ?? "connector",
                        label: prov ? PROVIDER_LABELS[prov] : p.name,
                        plugins: [],
                    };
                    map.set(key, entry);
                }
                entry.plugins.push({ ...p, pluginInfo: info });
            }
        }
        return Array.from(map.values());
    }, [config, pluginInfos]);

    const overrideAccounts = useMemo(() => {
        const result: {
            provider: UsageProvider;
            key: string;
            accountLabel: string;
            kind: "hidden" | "disabled";
        }[] = [];
        for (const kind of ["hidden", "disabled"] as const) {
            const overrides = config?.accountOverrides?.[kind];
            if (!overrides) continue;
            for (const [prov, keys] of Object.entries(overrides)) {
                for (const key of keys) {
                    const accountLabel = override_account_label(key);
                    result.push({ provider: prov as UsageProvider, key, accountLabel, kind });
                }
            }
        }
        return result;
    }, [config]);

    const restoreOverrideAccount = useCallback(
        (provider: UsageProvider, key: string, kind: "hidden" | "disabled") => {
            if (!config) return;
            const current = config.accountOverrides?.[kind]?.[provider];
            if (!current) return;
            const next = current.filter((k) => k !== key);
            const rest = { ...(config.accountOverrides[kind] ?? {}) };
            if (next.length === 0) {
                // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
                delete rest[provider];
            } else {
                rest[provider] = next;
            }
            const newOverrides =
                Object.keys(rest).length > 0
                    ? { ...config.accountOverrides, [kind]: rest }
                    : Object.fromEntries(
                          Object.entries(config.accountOverrides ?? {}).filter(
                              ([key]) => key !== kind,
                          ),
                      );
            void save_config({ ...config, accountOverrides: newOverrides });
        },
        [config, save_config],
    );

    // Config-backed settings with defaults for optional fields
    const accentColor = config?.accentColor ?? "#3d7afd";
    const themeMode = config?.theme ?? "light";
    const pinToTop = config?.pinToTop ?? false;
    const mainPanelMode = config?.mainPanelMode ?? "system";
    const floatingHeightMode = config?.floatingHeightMode ?? "fixed";
    const effectiveMainPanelMode =
        mainPanelMode === "system"
            ? window.usageboard.platform === "darwin"
                ? "popup"
                : "floating"
            : mainPanelMode;
    const minimizeToTray = config?.minimizeToTray ?? true;
    const globalIntervalSeconds = config?.globalRefreshIntervalSeconds ?? 300;
    const pauseAutoRefresh = config?.pauseAutoRefresh ?? false;
    const notifyNearLimit = config?.notifyNearLimit ?? true;
    const notifyAtLimit = config?.notifyAtLimit ?? true;
    const notifyOnFail = config?.notifyOnFail ?? true;
    const notifyMethod = config?.notifyMethod ?? "系统通知";
    const cacheMaxMb = config?.cacheMaxMb ?? 100;
    const usageBarColorScheme = config?.usageBarColorScheme ?? "risk-current";
    const usageBarStyle = config?.usageBarStyle ?? "thin";

    useEffect(() => {
        if (should_log_raw) {
            log.debug("settings usage bar color scheme raw", { value: usageBarColorScheme });
        }
    }, [usageBarColorScheme]);

    const interval_label = (() => {
        if (globalIntervalSeconds <= 60) return "1 分钟";
        if (globalIntervalSeconds <= 300) return "5 分钟";
        if (globalIntervalSeconds <= 900) return "15 分钟";
        if (globalIntervalSeconds <= 1800) return "30 分钟";
        return "仅手动";
    })();

    // Local-only UI state (not persisted)
    const [localState, setLocalState] = useState({
        lang: "简体中文",
    });
    const [dataMsg, setDataMsg] = useState<string | null>(null);

    const up = useCallback((k: string, v: unknown) => {
        setLocalState((p) => ({ ...p, [k]: v }));
    }, []);

    const handleExport = useCallback(async () => {
        try {
            const { saved } = await window.usageboard.config.export();
            setDataMsg(saved ? "设置已导出" : null);
        } catch {
            setDataMsg("导出失败");
        }
        setTimeout(() => {
            setDataMsg(null);
        }, 2000);
    }, []);

    const handleImport = useCallback(async () => {
        if (!window.confirm("导入将覆盖当前所有设置，确定继续？")) return;
        try {
            const { imported } = await window.usageboard.config.import();
            if (imported) {
                setDataMsg("导入成功，正在刷新...");
                window.location.reload();
            } else {
                setDataMsg(null);
            }
        } catch {
            setDataMsg("导入失败");
            setTimeout(() => {
                setDataMsg(null);
            }, 2000);
        }
    }, []);

    useEffect(() => {
        if (!config) return;
        let cancelled = false;
        void window.usageboard.plugin.list().then((plugins) => {
            if (!cancelled) setPluginInfos(plugins);
        });
        return () => {
            cancelled = true;
        };
    }, [config]);

    const savePluginSettings = useCallback(
        async (
            instanceId: string,
            nonSecrets: Record<string, string>,
            secrets: Record<string, string>,
            endpointOverrides: Record<string, string>,
            refreshIntervalSeconds: number,
        ) => {
            if (!config) return;
            if (Object.keys(secrets).length > 0) {
                await saveSecrets(instanceId, secrets);
            }
            await save_config({
                ...config,
                plugins: config.plugins.map((plugin) =>
                    plugin.instanceId === instanceId
                        ? {
                              ...plugin,
                              parameterValues: nonSecrets,
                              endpointOverrides,
                              refreshIntervalSeconds,
                          }
                        : plugin,
                ),
            });
        },
        [config, save_config, saveSecrets],
    );

    const savePluginSecrets = useCallback(
        async (instanceId: string, secrets: Record<string, string>) => {
            if (Object.keys(secrets).length > 0) {
                await saveSecrets(instanceId, secrets);
            }
        },
        [saveSecrets],
    );

    const refreshPlugin = useCallback(async (instanceId: string) => {
        await window.usageboard.plugin.refresh(instanceId);
    }, []);

    const goBack = () => {
        window.close();
    };

    if (loading) {
        return (
            <div className="window" data-window="settings">
                <TitleBar />
                <div className="p-6 text-[var(--text-3)]">加载中...</div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="window" data-window="settings">
                <TitleBar />
                <div className="p-6">
                    <div className="net-banner">
                        <Icon name="cloud_off" size={18} />
                        <span>{error}</span>
                    </div>
                </div>
            </div>
        );
    }
    if (!config) return null;

    return (
        <div className="window" data-window="settings">
            <TitleBar />

            <div className="settings">
                {/* header */}
                <div className="settings-head">
                    <button className="back-btn" onClick={goBack} type="button">
                        <Icon name="back" size={20} />
                    </button>
                    <span className="sh-title">设置</span>
                </div>

                <div className="settings-body">
                    {/* left nav */}
                    <div className="set-nav" data-testid="settings-sidebar">
                        {NAV_ITEMS.filter((n) => !("cpaOnly" in n) || hasCpa).map((n) => (
                            <button
                                key={n.id}
                                className={`set-nav-item${section === n.id ? " on" : ""}`}
                                onClick={() => {
                                    setSection(n.id);
                                }}
                                data-testid={`settings-plugin-nav-${n.id}`}
                                type="button"
                            >
                                <span className="sn-ic">
                                    <Icon name={n.icon} size={16} strokeWidth={1.7} />
                                </span>
                                {n.label}
                            </button>
                        ))}
                    </div>

                    {/* right content */}
                    <div className="set-content">
                        {/* ── General ── */}
                        {section === "general" && (
                            <>
                                <div className="set-group-label">启动</div>
                                <SetRow title="开机时自动启动" sub="登录系统后在后台运行并驻留托盘">
                                    <Toggle
                                        on={config.launchAtLogin}
                                        onClick={() => {
                                            void save_config({
                                                ...config,
                                                launchAtLogin: !config.launchAtLogin,
                                            });
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="启动后最小化到托盘">
                                    <Toggle
                                        on={minimizeToTray}
                                        onClick={() => {
                                            void save_config({
                                                ...config,
                                                minimizeToTray: !minimizeToTray,
                                            });
                                        }}
                                    />
                                </SetRow>

                                <div className="set-group-label">刷新</div>
                                <SetRow title="自动刷新间隔" sub="后台轮询各服务用量的频率">
                                    <Select
                                        value={interval_label}
                                        onChange={(v) => {
                                            const map: Record<string, number> = {
                                                "1 分钟": 60,
                                                "5 分钟": 300,
                                                "15 分钟": 900,
                                                "30 分钟": 1800,
                                                仅手动: 86400,
                                            };
                                            void save_config({
                                                ...config,
                                                globalRefreshIntervalSeconds: map[v] ?? 300,
                                            });
                                        }}
                                        options={[
                                            "1 分钟",
                                            "5 分钟",
                                            "15 分钟",
                                            "30 分钟",
                                            "仅手动",
                                        ]}
                                    />
                                </SetRow>
                                <SetRow title="暂停自动刷新" sub="临时停止后台轮询">
                                    <Toggle
                                        on={pauseAutoRefresh}
                                        onClick={() => {
                                            void save_config({
                                                ...config,
                                                pauseAutoRefresh: !pauseAutoRefresh,
                                            });
                                        }}
                                    />
                                </SetRow>

                                <div className="set-group-label">窗口</div>
                                <SetRow
                                    title="主面板打开方式"
                                    sub="左键托盘图标永远打开主面板，外壳由这里决定"
                                >
                                    <Select
                                        value={main_panel_mode_value_to_label(mainPanelMode)}
                                        onChange={(v) => {
                                            void save_config({
                                                ...config,
                                                mainPanelMode: main_panel_mode_label_to_value(v),
                                            });
                                        }}
                                        options={[...MAIN_PANEL_MODE_LABELS]}
                                    />
                                </SetRow>
                                <SetRow title="窗口始终置顶">
                                    <Toggle
                                        on={pinToTop}
                                        onClick={() => {
                                            void save_config({ ...config, pinToTop: !pinToTop });
                                        }}
                                    />
                                </SetRow>
                                {effectiveMainPanelMode === "floating" && (
                                    <SetRow
                                        title="浮动窗口高度"
                                        sub="保持窗口大小时内容在窗口内滚动；跟随内容变化时只能调整宽度"
                                    >
                                        <Select
                                            value={floating_height_mode_value_to_label(
                                                floatingHeightMode,
                                            )}
                                            onChange={(v) => {
                                                void save_config({
                                                    ...config,
                                                    floatingHeightMode:
                                                        floating_height_mode_label_to_value(v),
                                                });
                                            }}
                                            options={[...FLOATING_HEIGHT_MODE_LABELS]}
                                        />
                                    </SetRow>
                                )}
                                <SetRow title="界面语言">
                                    <Select
                                        value={localState.lang}
                                        onChange={(v) => {
                                            up("lang", v);
                                        }}
                                        options={["简体中文", "English", "跟随系统"]}
                                    />
                                </SetRow>
                            </>
                        )}

                        {/* ── Accounts ── */}
                        {section === "accounts" && (
                            <>
                                <div className="sp-head">
                                    <span className="sp-title">账号管理</span>
                                    <button
                                        className="sp-action"
                                        onClick={() => {
                                            setDialog({
                                                mode: "add",
                                                instanceId: undefined,
                                                pluginName: undefined,
                                            });
                                        }}
                                        type="button"
                                    >
                                        <Icon name="plus" size={15} strokeWidth={2} />
                                        添加账号
                                    </button>
                                </div>
                                <div className="acct-intro">
                                    关闭后该卡片不再显示在主面板，也会停止刷新用量。可随时在此重新启用。
                                </div>
                                {config.plugins.length === 0 ? (
                                    <div className="text-sm text-[var(--text-3)] py-4">
                                        暂无已配置的服务
                                    </div>
                                ) : pluginInfos.length === 0 ? (
                                    <div className="text-sm text-[var(--text-3)] py-4">
                                        加载中...
                                    </div>
                                ) : (
                                    account_groups.map((group) => {
                                        const all_disabled = group.plugins.every((p) => !p.enabled);
                                        // Single-account provider: one-row display (no group card)
                                        if (group.plugins.length === 1) {
                                            const p = group.plugins[0];
                                            if (!p) return null;
                                            const is_enabled = p.enabled;
                                            const info = p.pluginInfo;
                                            const display_name =
                                                info?.source === "cpa"
                                                    ? `CPA · ${group.label}`
                                                    : p.name;
                                            return (
                                                <div
                                                    className={`ao-item${!is_enabled ? " off" : ""}`}
                                                    key={group.label + group.provider}
                                                >
                                                    <div className="ao-vendor">
                                                        <VendorMark
                                                            id={
                                                                group.provider === "connector"
                                                                    ? "overview"
                                                                    : group.provider
                                                            }
                                                            size={24}
                                                        />
                                                        <span className="ao-name">
                                                            {display_name}
                                                        </span>
                                                    </div>
                                                    <div className="ao-actions">
                                                        {info?.source === "cpa" ? (
                                                            <span className="src-tag">
                                                                在数据源中管理
                                                            </span>
                                                        ) : (
                                                            <Toggle
                                                                on={is_enabled}
                                                                onClick={() => {
                                                                    void save_config({
                                                                        ...config,
                                                                        plugins: config.plugins.map(
                                                                            (pl) =>
                                                                                pl.instanceId ===
                                                                                p.instanceId
                                                                                    ? {
                                                                                          ...pl,
                                                                                          enabled:
                                                                                              !pl.enabled,
                                                                                      }
                                                                                    : pl,
                                                                        ),
                                                                    });
                                                                }}
                                                            />
                                                        )}
                                                        <button
                                                            className="icon-btn sp-ic"
                                                            title="编辑"
                                                            type="button"
                                                            onClick={() => {
                                                                setDialog({
                                                                    mode: "edit",
                                                                    instanceId: p.instanceId,
                                                                    pluginName: display_name,
                                                                });
                                                            }}
                                                        >
                                                            <Icon name="edit" size={15} />
                                                        </button>
                                                        {info?.source !== "cpa" && (
                                                            <button
                                                                className="icon-btn sp-ic danger"
                                                                title="删除"
                                                                type="button"
                                                                onClick={() => {
                                                                    if (
                                                                        !window.confirm(
                                                                            `确定删除 "${display_name}"？此操作不可撤销。`,
                                                                        )
                                                                    )
                                                                        return;
                                                                    void save_config({
                                                                        ...config,
                                                                        plugins:
                                                                            config.plugins.filter(
                                                                                (pl) =>
                                                                                    pl.instanceId !==
                                                                                    p.instanceId,
                                                                            ),
                                                                    });
                                                                }}
                                                            >
                                                                <Icon name="trash" size={15} />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        }
                                        // Multi-account provider: grouped display
                                        return (
                                            <div
                                                className={`acct-group${all_disabled ? " off" : ""}`}
                                                key={group.label + group.provider}
                                            >
                                                <div className="acct-group-head">
                                                    <VendorMark
                                                        id={
                                                            group.provider === "connector"
                                                                ? "overview"
                                                                : group.provider
                                                        }
                                                        size={22}
                                                    />
                                                    <span className="agh-name">{group.label}</span>
                                                    <span className="agh-count">
                                                        {group.plugins.length} 个账号
                                                    </span>
                                                    <button
                                                        className="agh-add"
                                                        title={`添加 ${group.label} 账号`}
                                                        type="button"
                                                        onClick={() => {
                                                            setDialog({
                                                                mode: "add",
                                                                instanceId: undefined,
                                                                pluginName: group.label,
                                                            });
                                                        }}
                                                    >
                                                        <Icon
                                                            name="plus"
                                                            size={16}
                                                            strokeWidth={2.2}
                                                        />
                                                    </button>
                                                </div>
                                                <div className="acct-rows">
                                                    {group.plugins.map((p) => {
                                                        const is_enabled = p.enabled;
                                                        const row_off = !is_enabled;
                                                        const info = p.pluginInfo;
                                                        const display_name =
                                                            info?.source === "cpa"
                                                                ? `CPA · ${group.label}`
                                                                : p.name;
                                                        return (
                                                            <div
                                                                className={`acct-row${row_off ? " off" : ""}`}
                                                                key={p.instanceId}
                                                            >
                                                                <span
                                                                    className={`ar-dot${row_off ? " off" : ""}`}
                                                                />
                                                                <span className="ar-name">
                                                                    {display_name}
                                                                </span>
                                                                <div className="ar-actions">
                                                                    {info?.source === "cpa" ? (
                                                                        <span className="src-tag">
                                                                            在数据源中管理
                                                                        </span>
                                                                    ) : (
                                                                        <Toggle
                                                                            on={is_enabled}
                                                                            onClick={() => {
                                                                                void save_config({
                                                                                    ...config,
                                                                                    plugins:
                                                                                        config.plugins.map(
                                                                                            (pl) =>
                                                                                                pl.instanceId ===
                                                                                                p.instanceId
                                                                                                    ? {
                                                                                                          ...pl,
                                                                                                          enabled:
                                                                                                              !pl.enabled,
                                                                                                      }
                                                                                                    : pl,
                                                                                        ),
                                                                                });
                                                                            }}
                                                                        />
                                                                    )}
                                                                    <button
                                                                        className="icon-btn sp-ic"
                                                                        title="编辑"
                                                                        type="button"
                                                                        onClick={() => {
                                                                            setDialog({
                                                                                mode: "edit",
                                                                                instanceId:
                                                                                    p.instanceId,
                                                                                pluginName:
                                                                                    display_name,
                                                                            });
                                                                        }}
                                                                    >
                                                                        <Icon
                                                                            name="edit"
                                                                            size={15}
                                                                        />
                                                                    </button>
                                                                    {info?.source !== "cpa" && (
                                                                        <button
                                                                            className="icon-btn sp-ic danger"
                                                                            title="删除"
                                                                            type="button"
                                                                            onClick={() => {
                                                                                if (
                                                                                    !window.confirm(
                                                                                        `确定删除 "${display_name}"？此操作不可撤销。`,
                                                                                    )
                                                                                ) {
                                                                                    return;
                                                                                }
                                                                                void save_config({
                                                                                    ...config,
                                                                                    plugins:
                                                                                        config.plugins.filter(
                                                                                            (pl) =>
                                                                                                pl.instanceId !==
                                                                                                p.instanceId,
                                                                                        ),
                                                                                });
                                                                            }}
                                                                        >
                                                                            <Icon
                                                                                name="trash"
                                                                                size={15}
                                                                            />
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                                {overrideAccounts.length > 0 && (
                                    <>
                                        <div className="set-group-label" style={{ marginTop: 16 }}>
                                            已隐藏 / 已关闭的账号
                                        </div>
                                        <div className="acct-intro">
                                            这些账号来自主面板账号菜单的"隐藏"或"关闭监控"操作，可在这里恢复。
                                        </div>
                                        {overrideAccounts.map((item) => (
                                            <div className="ao-item" key={item.key}>
                                                <div className="ao-vendor">
                                                    <VendorMark id={item.provider} size={20} />
                                                    <span className="ao-name">
                                                        {item.accountLabel}
                                                    </span>
                                                    <span className="src-tag">
                                                        {item.kind === "hidden"
                                                            ? "已隐藏"
                                                            : "已关闭"}
                                                    </span>
                                                </div>
                                                <div className="ao-actions">
                                                    <button
                                                        className="icon-btn sp-ic"
                                                        title="恢复"
                                                        type="button"
                                                        onClick={() => {
                                                            restoreOverrideAccount(
                                                                item.provider,
                                                                item.key,
                                                                item.kind,
                                                            );
                                                        }}
                                                    >
                                                        <Icon name="eye" size={15} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </>
                                )}
                            </>
                        )}

                        {/* ── Data Source (CPA Manager) ── */}
                        {section === "datasource" && (
                            <>
                                {dsView === "list" && (
                                    <DataSourceList
                                        pluginInfos={pluginInfos}
                                        config={config}
                                        onOpenDetail={() => {
                                            setDsView("detail");
                                        }}
                                        onAdd={() => {
                                            setShowCpaAdd(true);
                                        }}
                                    />
                                )}
                                {dsView === "detail" && (
                                    <CpaDetailPage
                                        pluginInfos={pluginInfos}
                                        config={config}
                                        hasSecrets={hasSecrets}
                                        onBack={() => {
                                            setDsView("list");
                                        }}
                                        onSave={savePluginSettings}
                                        onSaveSecrets={savePluginSecrets}
                                        onRefresh={refreshPlugin}
                                        onDelete={async (instanceId) => {
                                            await save_config({
                                                ...config,
                                                plugins: config.plugins.filter(
                                                    (p) => p.instanceId !== instanceId,
                                                ),
                                            });
                                            setDsView("list");
                                        }}
                                        saveConfig={save_config}
                                    />
                                )}
                            </>
                        )}

                        {/* ── Appearance ── */}
                        {section === "appearance" && (
                            <>
                                <div className="set-group-label">主题</div>
                                <SetRow title="配色方案">
                                    <div className="set-seg">
                                        {(
                                            [
                                                ["light", "浅色"],
                                                ["dark", "深色"],
                                                ["system", "跟随系统"],
                                            ] as const
                                        ).map(([k, lb]) => (
                                            <button
                                                key={k}
                                                className={
                                                    (
                                                        k === "system"
                                                            ? themeMode ===
                                                              (window.matchMedia(
                                                                  "(prefers-color-scheme: dark)",
                                                              ).matches
                                                                  ? "dark"
                                                                  : "light")
                                                            : themeMode === k
                                                    )
                                                        ? "on"
                                                        : ""
                                                }
                                                onClick={() => {
                                                    const newTheme = k;
                                                    void save_config({
                                                        ...config,
                                                        theme: newTheme,
                                                    });
                                                    window.usageboard.theme.set(newTheme);
                                                }}
                                                type="button"
                                            >
                                                {lb}
                                            </button>
                                        ))}
                                    </div>
                                </SetRow>
                                <SetRow title="强调色" sub="用于选中状态、进度条与主要操作">
                                    <div className="accent-row">
                                        {ACCENTS.map((c) => (
                                            <button
                                                key={c}
                                                className={`accent-sw${accentColor === c ? " on" : ""}`}
                                                style={{ background: c, color: c }}
                                                onClick={() => {
                                                    void save_config({ ...config, accentColor: c });
                                                    // Apply accent CSS variable immediately
                                                    if (c === "#3d7afd") {
                                                        document.documentElement.style.removeProperty(
                                                            "--blue",
                                                        );
                                                    } else {
                                                        document.documentElement.style.setProperty(
                                                            "--blue",
                                                            c,
                                                        );
                                                    }
                                                }}
                                                type="button"
                                            />
                                        ))}
                                    </div>
                                </SetRow>
                                <div className="set-group-label">用量条</div>
                                <SetRow
                                    title="用量条样式"
                                    sub="细线型保持紧凑；粗胶囊型把数值放进进度条内。"
                                >
                                    <div className="set-seg" aria-label="用量条样式">
                                        {BAR_STYLE_LABELS.map((label) => {
                                            const value = bar_style_label_to_value(label);
                                            return (
                                                <button
                                                    key={label}
                                                    className={usageBarStyle === value ? "on" : ""}
                                                    onClick={() => {
                                                        void save_config({
                                                            ...config,
                                                            usageBarStyle: value,
                                                        });
                                                    }}
                                                    type="button"
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </SetRow>
                                <div className="set-row set-row-stack">
                                    <div className="sr-text">
                                        <div className="sr-title">用量条颜色方案</div>
                                        <div className="sr-sub">
                                            控制所有用量条的取色方式。默认按当前用量显示风险色。
                                        </div>
                                    </div>
                                    <BarSchemeField
                                        value={usageBarColorScheme}
                                        onChange={(value) => {
                                            void save_config({
                                                ...config,
                                                usageBarColorScheme: value,
                                            });
                                        }}
                                    />
                                </div>
                                <div className="set-row set-row-stack">
                                    <div className="sr-text">
                                        <div className="sr-title">用量标签映射</div>
                                        <div className="sr-sub">
                                            每行一个“原始名称=显示名称”，会覆盖内置长标签缩写。
                                        </div>
                                    </div>
                                    <textarea
                                        className="set-textarea"
                                        aria-label="用量标签映射"
                                        value={usage_label_map_text}
                                        onChange={(event) => {
                                            const next_text = event.target.value.slice(
                                                0,
                                                USAGE_LABEL_MAP_MAX_TEXT_LENGTH,
                                            );
                                            usage_label_map_dirty_ref.current = true;
                                            set_usage_label_map_text(next_text);
                                            const usage_label_map =
                                                parse_usage_label_map(next_text);
                                            if (!usage_label_map && next_text.trim().length > 0)
                                                return;
                                            const {
                                                usageLabelMap: removed_usage_label_map,
                                                ...rest
                                            } = config;
                                            void removed_usage_label_map;
                                            void save_config({
                                                ...rest,
                                                ...(usage_label_map && {
                                                    usageLabelMap: usage_label_map,
                                                }),
                                            });
                                        }}
                                    />
                                </div>
                            </>
                        )}

                        {/* ── Notify ── */}
                        {section === "notify" && (
                            <>
                                <div className="set-group-label">用量提醒</div>
                                <SetRow title="接近限制时提醒" sub="任一周期用量达到 80% 时">
                                    <Toggle
                                        on={notifyNearLimit}
                                        onClick={() => {
                                            void save_config({
                                                ...config,
                                                notifyNearLimit: !notifyNearLimit,
                                            });
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="达到限制时提醒" sub="任一周期用量达到 100% 时">
                                    <Toggle
                                        on={notifyAtLimit}
                                        onClick={() => {
                                            void save_config({
                                                ...config,
                                                notifyAtLimit: !notifyAtLimit,
                                            });
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="刷新失败时提醒" sub="连续刷新失败或凭证失效时">
                                    <Toggle
                                        on={notifyOnFail}
                                        onClick={() => {
                                            void save_config({
                                                ...config,
                                                notifyOnFail: !notifyOnFail,
                                            });
                                        }}
                                    />
                                </SetRow>
                                <div className="set-group-label">方式</div>
                                <SetRow title="提醒方式">
                                    <Select
                                        value={notifyMethod}
                                        onChange={(v) => {
                                            void save_config({ ...config, notifyMethod: v });
                                        }}
                                        options={["系统通知", "托盘图标角标", "仅应用内", "关闭"]}
                                    />
                                </SetRow>
                            </>
                        )}

                        {/* ── Data & Privacy ── */}
                        {section === "data" && (
                            <>
                                <div className="set-group-label">存储</div>
                                <SetRow
                                    title="本地缓存上限"
                                    sub="历史趋势数据占用的最大空间，超出后自动清理最旧记录"
                                >
                                    <Select
                                        value={
                                            cacheMaxMb === 0 ? "不限制" : `${String(cacheMaxMb)} MB`
                                        }
                                        onChange={(v) => {
                                            if (v === "不限制") {
                                                void save_config({ ...config, cacheMaxMb: 0 });
                                                return;
                                            }
                                            const mb = parseInt(v, 10);
                                            if (!isNaN(mb)) {
                                                void save_config({ ...config, cacheMaxMb: mb });
                                            }
                                        }}
                                        options={["50 MB", "100 MB", "200 MB", "500 MB", "不限制"]}
                                    />
                                </SetRow>
                                <SetRow title="本地用量缓存" sub="历史趋势数据 · 占用 4.2 MB">
                                    <button
                                        className="set-select"
                                        style={{ background: "var(--field-bg)" }}
                                        type="button"
                                    >
                                        清除
                                    </button>
                                </SetRow>
                                <div className="set-group-label">数据</div>
                                <SetRow title="导出设置" sub="导出全部配置与账号密钥到 JSON 文件">
                                    <button
                                        className="set-select"
                                        style={{ background: "var(--field-bg)" }}
                                        type="button"
                                        onClick={() => {
                                            void handleExport();
                                        }}
                                    >
                                        {dataMsg === "设置已导出" ? "已导出" : "导出"}
                                    </button>
                                </SetRow>
                                <SetRow title="导入设置" sub="从 JSON 文件恢复配置与账号密钥">
                                    <button
                                        className="set-select"
                                        style={{ background: "var(--field-bg)" }}
                                        type="button"
                                        onClick={() => {
                                            void handleImport();
                                        }}
                                    >
                                        {dataMsg === "导入失败" ? "失败" : "导入"}
                                    </button>
                                </SetRow>
                                <SetRow title="导出用量数据" sub="导出为 CSV / JSON">
                                    <button
                                        className="set-select"
                                        style={{ background: "var(--field-bg)" }}
                                        type="button"
                                    >
                                        导出
                                    </button>
                                </SetRow>
                                <SetRow
                                    title="匿名使用统计"
                                    sub="帮助改进 OmniUsage，不含任何用量内容"
                                >
                                    <Toggle on={false} disabled />
                                </SetRow>
                                <div className="set-group-label" style={{ color: "var(--red)" }}>
                                    危险区域
                                </div>
                                <SetRow title="重置应用" sub="清除全部账号、设置与缓存">
                                    <button
                                        className="set-select"
                                        style={{
                                            color: "var(--red)",
                                            borderColor:
                                                "color-mix(in srgb,var(--red) 35%,transparent)",
                                        }}
                                        type="button"
                                    >
                                        重置
                                    </button>
                                </SetRow>
                            </>
                        )}

                        {/* ── About ── */}
                        {section === "about" && (
                            <>
                                <div className="about-app">
                                    <img
                                        src={logo}
                                        alt="OmniUsage"
                                        className="aa-logo"
                                        width="56"
                                        height="56"
                                        style={{ borderRadius: 12 }}
                                    />
                                    <div className="aa-name">OmniUsage</div>
                                    <div className="aa-ver">版本 {version} · 已是最新版本</div>
                                    <button className="btn-primary" type="button">
                                        <Icon name="refresh" size={15} color="#fff" />
                                        检查更新
                                    </button>
                                </div>
                                <div className="about-links">
                                    <SetRow title="更新日志" sub="即将推出">
                                        <Icon name="chevron" size={16} color="var(--text-3)" />
                                    </SetRow>
                                    <SetRow title="开源许可" sub="即将推出">
                                        <Icon name="chevron" size={16} color="var(--text-3)" />
                                    </SetRow>
                                    <SetRow title="反馈问题" sub="即将推出">
                                        <Icon name="chevron" size={16} color="var(--text-3)" />
                                    </SetRow>
                                    <SetRow title="访问官网" sub="即将推出">
                                        <Icon
                                            name="external_link"
                                            size={15}
                                            color="var(--text-3)"
                                        />
                                    </SetRow>
                                </div>
                                <div
                                    style={{
                                        textAlign: "center",
                                        fontSize: 11.5,
                                        color: "var(--text-3)",
                                        marginTop: 18,
                                    }}
                                >
                                    © 2026 OmniUsage · 跨平台 AI 用量监控
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Account dialog */}
                {dialog && (
                    <AccountDialog
                        key={`${dialog.mode}:${dialog.instanceId ?? "new"}`}
                        mode={dialog.mode}
                        instanceId={dialog.instanceId ?? undefined}
                        pluginName={dialog.pluginName}
                        pluginInfo={pluginInfos.find((p) => p.instanceId === dialog.instanceId)}
                        pluginConfig={config.plugins.find(
                            (p) => p.instanceId === dialog.instanceId,
                        )}
                        pluginInfos={pluginInfos}
                        hasSecrets={dialog.instanceId ? hasSecrets[dialog.instanceId] : undefined}
                        onSave={savePluginSettings}
                        onSaveSecrets={savePluginSecrets}
                        onRefresh={refreshPlugin}
                        onSelectService={(id, name) => {
                            setDialog({ mode: "edit", instanceId: id, pluginName: name });
                        }}
                        onCpa={() => {
                            setDialog(null);
                            setShowCpaAdd(true);
                        }}
                        onClose={() => {
                            setDialog(null);
                        }}
                    />
                )}
                {showCpaAdd && (
                    <CpaAddDialog
                        onClose={() => {
                            setShowCpaAdd(false);
                        }}
                    />
                )}
            </div>
        </div>
    );
}

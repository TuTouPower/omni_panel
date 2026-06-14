import { useState, useEffect, useCallback, useRef } from "react";
import { use_config } from "../hooks/use-config";
import { useTheme } from "../lib/theme";
import {
    REFRESH_INTERVAL_OPTIONS,
    refresh_seconds_to_label,
    refresh_label_to_seconds,
} from "../lib/refresh-intervals";
import { add_account_override, remove_account_override } from "../lib/account-overrides";
import { SettingsForm } from "../components/SettingsForm";
import { CpaConnectorSettings } from "../components/CpaConnectorSettings";
import { VendorCard } from "../components/VendorCard";
import { CpaCard } from "../components/CpaCard";
import { AddAccountDialog } from "../components/AddAccountDialog";
import type { AddAccountParams } from "../components/AddAccountDialog";
import { LabelMapDialog } from "../components/LabelMapDialog";
import { ConfirmDelete } from "../components/ConfirmDelete";
import { Icon, VendorMark } from "../components/Icon";
import type { ConnectorInfo } from "../../shared/types/ipc";
import type {
    ConnectorConfiguration,
    AppConfiguration,
    MainPanelMode,
    FloatingHeightMode,
    UsageBarColorScheme,
    UsageBarStyle,
} from "../../shared/types/config";
import type { MetricRecord, UsageProvider } from "../../shared/schemas/plugin-output";
import { PROVIDER_LABELS } from "../lib/provider-usage";
import { createLogger } from "../../shared/lib/logger";
import { redact_config_raw } from "../../shared/lib/config_redaction";
import logo from "../assets/logo.png";
import package_json from "../../../package.json";

/* ── types ── */
interface DialogState {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
    providerId?: UsageProvider | undefined;
}

/* ── constants ── */
const NAV_ITEMS = [
    { id: "general", label: "常规", icon: "gear" },
    { id: "accounts", label: "账号", icon: "inbox" },
    { id: "appearance", label: "外观", icon: "palette" },
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

function snapshot_items(pluginInfo: ConnectorInfo): readonly MetricRecord[] {
    if (pluginInfo.snapshot.status === "ready") return pluginInfo.snapshot.items;
    if (pluginInfo.snapshot.status === "failed") return pluginInfo.snapshot.items ?? [];
    return [];
}

function connection_status(pluginInfo: ConnectorInfo, enabled: boolean): string {
    if (!enabled) return "已停用";
    if (pluginInfo.snapshot.status === "ready") return "正常";
    if (pluginInfo.snapshot.status === "failed") return "异常";
    return "未连接";
}

function map_status(status: string): "ok" | "error" | "disabled" | "unknown" {
    if (status === "正常") return "ok";
    if (status === "异常") return "error";
    if (status === "已停用") return "disabled";
    return "unknown";
}

/* ── helpers ── */
function Toggle({
    on,
    onClick,
    disabled,
}: {
    on: boolean;
    onClick?: (event: React.MouseEvent<HTMLButtonElement>) => void;
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
    onSelectService,
    onCpa,
    onClose,
    existingLabelMap,
    onSaveLabelMap,
    globalIntervalLabel,
}: {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
    pluginInfo: ConnectorInfo | undefined;
    pluginConfig: ConnectorConfiguration | undefined;
    pluginInfos: ConnectorInfo[];
    hasSecrets: Record<string, boolean> | undefined;
    onSave: (
        instanceId: string,
        nonSecrets: Record<string, string>,
        secrets: Record<string, string>,
        endpointOverrides: Record<string, string>,
        refreshIntervalSeconds: number,
    ) => Promise<void>;
    onSelectService: (instanceId: string, pluginName: string) => void;
    onCpa: () => void;
    onClose: () => void;
    existingLabelMap?: Readonly<Record<string, string>>;
    onSaveLabelMap?: (instanceId: string, map: Record<string, string>) => Promise<void>;
    globalIntervalLabel: string;
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
                    {isEdit && pluginInfo && (
                        <span className="ad-mark">
                            <VendorMark id={pluginInfo.activeProviders[0] ?? "unknown"} size={24} />
                        </span>
                    )}
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
                        <SettingsForm
                            instanceId={instanceId}
                            parameters={pluginInfo.metadata?.parameters ?? []}
                            values={pluginConfig.parameterValues}
                            hasSecrets={hasSecrets ?? {}}
                            endpoints={pluginInfo.metadata?.endpoints ?? {}}
                            endpointValues={pluginConfig.endpointOverrides}
                            refreshIntervalSeconds={pluginConfig.refreshIntervalSeconds}
                            globalIntervalLabel={globalIntervalLabel}
                            {...(pluginConfig.manualRefreshOnly ? { manualRefreshOnly: true } : {})}
                            {...(pluginInfo.activeProviders[0]
                                ? { providerId: pluginInfo.activeProviders[0] }
                                : {})}
                            onCookieLogin={async (id) => {
                                try {
                                    const result = await window.usageboard.auth.cookieLogin(id);
                                    if (result.saved) {
                                        await window.usageboard.connector.refresh(id);
                                        await window.usageboard.config.get();
                                    }
                                    return result.saved;
                                } catch {
                                    return false;
                                }
                            }}
                            onSave={async (...args) => {
                                await onSave(...args);
                                onClose();
                            }}
                            existingLabelMap={existingLabelMap}
                            onSaveLabelMap={onSaveLabelMap}
                        />
                    ) : mode === "add" && !instanceId ? (
                        <AddAccountPicker
                            pluginInfos={pluginInfos}
                            onSelect={onSelectService}
                            onCpa={onCpa}
                        />
                    ) : mode === "edit" ? (
                        <div className="text-sm text-[var(--text-3)]">加载中...</div>
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
    pluginInfos: ConnectorInfo[];
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
    const [pluginInfos, setConnectorInfos] = useState<ConnectorInfo[]>([]);
    const [section, setSection] = useState("general");
    const [dialog, setDialog] = useState<DialogState | null>(null);
    const [showCpaAdd, setShowCpaAdd] = useState(false);
    const [show_add_account_dialog, set_show_add_account_dialog] = useState(false);
    const [label_map_dialog, set_label_map_dialog] = useState<{
        instance_id: string;
        vendor_id: UsageProvider;
        account_name: string;
        save_target: "account" | "provider";
    } | null>(null);
    const [editingCpaId, setEditingCpaId] = useState<string | null>(null);

    // Confirm-delete state for direct account deletion
    const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
    const [deleteConfirmName, setDeleteConfirmName] = useState("");
    // Confirm-delete state for CPA data-source removal
    const [removeCpaConfirmId, setRemoveCpaConfirmId] = useState<string | null>(null);
    const [removeCpaConfirmName, setRemoveCpaConfirmName] = useState("");

    useEffect(() => {
        if (should_log_raw && config) {
            log.debug("settings config raw", { config: redact_config_raw(config) });
        }
    }, [config]);

    const save_config = useCallback(
        async (payload: AppConfiguration) => {
            if (should_log_raw) {
                log.debug("settings save payload raw", { payload: redact_config_raw(payload) });
            }
            await save(payload);
        },
        [save],
    );

    // Listen for navigate events from main panel (edit account)
    useEffect(() => {
        const unsub = window.usageboard.event.onSettingsNavigate((context) => {
            setSection("accounts");
            if (context.instanceId) {
                setDialog({ mode: "edit", instanceId: context.instanceId, pluginName: undefined });
            } else if (context.provider) {
                let match = pluginInfos.find((p) =>
                    p.activeProviders.includes(context.provider as UsageProvider),
                );
                if (match) {
                    setDialog({
                        mode: "edit",
                        instanceId: match.instanceId,
                        pluginName: match.displayName,
                    });
                } else {
                    // pluginInfos may not be loaded yet — fetch fresh and retry
                    void window.usageboard.connector.list().then((plugins) => {
                        setConnectorInfos(plugins);
                        match = plugins.find((p) =>
                            p.activeProviders.includes(context.provider as UsageProvider),
                        );
                        if (match) {
                            setDialog({
                                mode: "edit",
                                instanceId: match.instanceId,
                                pluginName: match.displayName,
                            });
                        }
                    });
                }
            }
        });
        return unsub;
    }, [pluginInfos]);

    const restoreOverrideAccount = useCallback(
        (provider: UsageProvider, key: string, kind: "hidden" | "disabled") => {
            if (!config?.accountOverrides) return;
            const newOverrides = remove_account_override(
                config.accountOverrides,
                kind,
                provider,
                key,
            );
            void save_config({ ...config, accountOverrides: newOverrides });
        },
        [config, save_config],
    );

    const hide_account = useCallback(
        (item: MetricRecord) => {
            if (!config) return;
            const newOverrides = add_account_override(
                config.accountOverrides,
                "hidden",
                item.provider,
                item.accountId,
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
    const cacheMaxMb = config?.cacheMaxMb ?? 100;
    const usageBarColorScheme = config?.usageBarColorScheme ?? "risk-current";
    const usageBarStyle = config?.usageBarStyle ?? "thin";

    useEffect(() => {
        if (should_log_raw) {
            log.debug("settings usage bar color scheme raw", { value: usageBarColorScheme });
        }
    }, [usageBarColorScheme]);

    const interval_label = refresh_seconds_to_label(globalIntervalSeconds);

    // Local-only UI state (not persisted)
    const [localState, setLocalState] = useState({
        lang: "简体中文",
    });
    const [dataMsg, setDataMsg] = useState<string | null>(null);
    const data_msg_timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
        clearTimeout(data_msg_timer.current);
        data_msg_timer.current = setTimeout(() => {
            setDataMsg(null);
        }, 2000);
    }, []);

    const handleExportLogs = useCallback(async () => {
        try {
            const { saved } = await window.usageboard.logs.export();
            setDataMsg(saved ? "日志已导出" : null);
        } catch {
            setDataMsg("导出失败");
        }
        clearTimeout(data_msg_timer.current);
        data_msg_timer.current = setTimeout(() => {
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
            clearTimeout(data_msg_timer.current);
            data_msg_timer.current = setTimeout(() => {
                setDataMsg(null);
            }, 2000);
        }
    }, []);

    useEffect(() => {
        if (!config) return;
        let cancelled = false;
        void window.usageboard.connector.list().then((plugins) => {
            if (!cancelled) setConnectorInfos(plugins);
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
            await window.usageboard.connector.refresh(instanceId);
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

    const create_plugin_instance = useCallback(
        async (params: AddAccountParams) => {
            if (!config) return;
            const template = pluginInfos.find(
                (p) => p.activeProviders.includes(params.vendor_id) && p.enabled,
            );
            if (!template) return;

            const template_plugin = config.plugins.find(
                (p) => p.instanceId === template.instanceId,
            );
            if (!template_plugin) return;

            const new_id = crypto.randomUUID();
            // Save config FIRST so secretParamKeys is rebuilt before saving secrets
            await save_config({
                ...config,
                plugins: [
                    ...config.plugins,
                    {
                        instanceId: new_id,
                        stateId: new_id,
                        name: params.account_name,
                        enabled: true,
                        executablePath: template_plugin.executablePath,
                        refreshIntervalSeconds: template_plugin.refreshIntervalSeconds,
                        parameterValues: params.parameter_values,
                        endpointOverrides: params.endpoint_overrides ?? {},
                    },
                ],
            });
            if (Object.keys(params.secrets).length > 0) {
                await saveSecrets(new_id, params.secrets);
            }
            await window.usageboard.connector.refresh(new_id);
        },
        [config, pluginInfos, save_config, saveSecrets],
    );

    const refreshPlugin = useCallback(async (instanceId: string) => {
        await window.usageboard.connector.refresh(instanceId);
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
                        {NAV_ITEMS.map((n) => (
                            <button
                                key={n.id}
                                className={`set-nav-item${section === n.id ? " on" : ""}`}
                                onClick={() => {
                                    setSection(n.id);
                                    setEditingCpaId(null);
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
                                            void save_config({
                                                ...config,
                                                globalRefreshIntervalSeconds:
                                                    refresh_label_to_seconds(v),
                                            });
                                        }}
                                        options={REFRESH_INTERVAL_OPTIONS.map((opt) => opt.label)}
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
                                <div className="set-group-label">其他</div>
                                <SetRow
                                    title="同一数据源的数据标签映射同步"
                                    sub="同一数据源下的多个账号共用一套数据标签映射，编辑任一账号即同步到全部"
                                >
                                    <Toggle
                                        on={config.labelMapSync ?? false}
                                        onClick={() => {
                                            void save_config({
                                                ...config,
                                                labelMapSync: !(config.labelMapSync ?? false),
                                            });
                                        }}
                                    />
                                </SetRow>
                            </>
                        )}

                        {/* ── Added Connections / CPA Detail ── */}
                        {section === "accounts" &&
                            editingCpaId &&
                            (() => {
                                const editingPlugin = config.plugins.find(
                                    (p) => p.instanceId === editingCpaId,
                                );
                                const editingInfo = pluginInfos.find(
                                    (p) => p.instanceId === editingCpaId,
                                );
                                if (!editingPlugin || !editingInfo) return null;
                                const editingPluginConfig = editingPlugin;
                                return (
                                    <>
                                        <div className="sp-head">
                                            <div className="sp-crumb">
                                                <span
                                                    className="sp-crumb-link"
                                                    onClick={() => {
                                                        setEditingCpaId(null);
                                                    }}
                                                >
                                                    账号
                                                </span>
                                                <span className="cc-sep">
                                                    <Icon name="chevron" size={15} />
                                                </span>
                                                <span className="cc-cur">
                                                    {editingInfo.displayName}
                                                </span>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", flex: 1 }}>
                                            <CpaConnectorSettings
                                                connector={editingInfo}
                                                config={{
                                                    endpointOverrides:
                                                        editingPluginConfig.endpointOverrides,
                                                    parameterValues:
                                                        editingPluginConfig.parameterValues,
                                                    refreshIntervalSeconds:
                                                        editingPluginConfig.refreshIntervalSeconds,
                                                    enabled: editingPluginConfig.enabled,
                                                }}
                                                enabled={editingPluginConfig.enabled}
                                                displayName={editingPluginConfig.name}
                                                globalIntervalLabel={interval_label}
                                                hasSecrets={hasSecrets[editingCpaId] ?? {}}
                                                onSave={async (
                                                    nonSecrets,
                                                    endpointOverrides,
                                                    refreshIntervalSeconds,
                                                    newDisplayName,
                                                ) => {
                                                    if (
                                                        newDisplayName !== editingPluginConfig.name
                                                    ) {
                                                        await save_config({
                                                            ...config,
                                                            plugins: config.plugins.map((pl) =>
                                                                pl.instanceId === editingCpaId
                                                                    ? {
                                                                          ...pl,
                                                                          name: newDisplayName,
                                                                      }
                                                                    : pl,
                                                            ),
                                                        });
                                                    }
                                                    await savePluginSettings(
                                                        editingCpaId,
                                                        nonSecrets,
                                                        {},
                                                        endpointOverrides,
                                                        refreshIntervalSeconds,
                                                    );
                                                }}
                                                onSaveSecrets={async (secrets) => {
                                                    await savePluginSecrets(editingCpaId, secrets);
                                                }}
                                                onToggleEnabled={(nextEnabled) => {
                                                    void save_config({
                                                        ...config,
                                                        plugins: config.plugins.map((pl) =>
                                                            pl.instanceId === editingCpaId
                                                                ? { ...pl, enabled: nextEnabled }
                                                                : pl,
                                                        ),
                                                    });
                                                }}
                                                onRefresh={async () => {
                                                    await refreshPlugin(editingCpaId);
                                                }}
                                                onRemove={() => {
                                                    setRemoveCpaConfirmId(editingCpaId);
                                                    setRemoveCpaConfirmName(
                                                        editingInfo.displayName,
                                                    );
                                                }}
                                                onEditLabelMap={(provider) => {
                                                    set_label_map_dialog({
                                                        instance_id: editingCpaId,
                                                        vendor_id: provider,
                                                        account_name: PROVIDER_LABELS[provider],
                                                        save_target: "provider",
                                                    });
                                                }}
                                                providerLabelMaps={config.accountLabelMaps}
                                            />
                                        </div>
                                    </>
                                );
                            })()}
                        {section === "accounts" && !editingCpaId && (
                            <>
                                <div className="sp-head">
                                    <span className="sp-title">已添加</span>
                                    <button
                                        className="sp-action"
                                        onClick={() => {
                                            set_show_add_account_dialog(true);
                                        }}
                                        type="button"
                                    >
                                        <Icon name="plus" size={15} strokeWidth={2} />
                                        添加
                                    </button>
                                </div>
                                <div className="set-group-label" style={{ marginTop: 16 }}>
                                    已添加
                                </div>
                                {config.plugins.length === 0 ? (
                                    <div className="text-sm text-[var(--text-3)] py-4">
                                        暂无已添加连接
                                    </div>
                                ) : pluginInfos.length === 0 ? (
                                    <div className="text-sm text-[var(--text-3)] py-4">
                                        加载中...
                                    </div>
                                ) : (
                                    (() => {
                                        /* ── build view model ── */
                                        const direct_groups = new Map<
                                            string,
                                            {
                                                instance_ids: string[];
                                                rows: {
                                                    instance_id: string;
                                                    account_label: string;
                                                    enabled: boolean;
                                                    status:
                                                        | "ok"
                                                        | "error"
                                                        | "auth"
                                                        | "disabled"
                                                        | "unknown";
                                                }[];
                                            }
                                        >();
                                        const cpa_plugins: (typeof config.plugins)[number][] = [];

                                        for (const plugin of config.plugins) {
                                            const info = pluginInfos.find(
                                                (item) => item.instanceId === plugin.instanceId,
                                            );
                                            const is_cpa = info?.source === "cpa";
                                            if (is_cpa) {
                                                cpa_plugins.push(plugin);
                                            } else {
                                                const provider_id =
                                                    info?.activeProviders[0] ?? "unknown";
                                                const existing = direct_groups.get(provider_id);
                                                const status_label = info
                                                    ? connection_status(info, plugin.enabled)
                                                    : plugin.enabled
                                                      ? "未连接"
                                                      : "已停用";
                                                const row = {
                                                    instance_id: plugin.instanceId,
                                                    account_label: info?.displayName ?? plugin.name,
                                                    enabled: plugin.enabled,
                                                    status: map_status(status_label),
                                                };
                                                if (existing) {
                                                    existing.instance_ids.push(plugin.instanceId);
                                                    existing.rows.push(row);
                                                } else {
                                                    direct_groups.set(provider_id, {
                                                        instance_ids: [plugin.instanceId],
                                                        rows: [row],
                                                    });
                                                }
                                            }
                                        }

                                        return (
                                            <div className="acct-list">
                                                {Array.from(direct_groups.entries()).map(
                                                    ([provider_id, group]) => (
                                                        <VendorCard
                                                            key={provider_id}
                                                            provider={provider_id}
                                                            rows={group.rows}
                                                            on_toggle={(instance_id) => {
                                                                void save_config({
                                                                    ...config,
                                                                    plugins: config.plugins.map(
                                                                        (pl) =>
                                                                            pl.instanceId ===
                                                                            instance_id
                                                                                ? {
                                                                                      ...pl,
                                                                                      enabled:
                                                                                          !pl.enabled,
                                                                                  }
                                                                                : pl,
                                                                    ),
                                                                });
                                                            }}
                                                            on_refresh={(instance_id) => {
                                                                void window.usageboard.connector.refresh(
                                                                    instance_id,
                                                                );
                                                            }}
                                                            on_edit={(instance_id) => {
                                                                const info = pluginInfos.find(
                                                                    (p) =>
                                                                        p.instanceId ===
                                                                        instance_id,
                                                                );
                                                                setDialog({
                                                                    mode: "edit",
                                                                    instanceId: instance_id,
                                                                    pluginName: info?.displayName,
                                                                });
                                                            }}
                                                            on_delete={(instance_id) => {
                                                                const info = pluginInfos.find(
                                                                    (p) =>
                                                                        p.instanceId ===
                                                                        instance_id,
                                                                );
                                                                setDeleteConfirmId(instance_id);
                                                                setDeleteConfirmName(
                                                                    info?.displayName ??
                                                                        instance_id,
                                                                );
                                                            }}
                                                        />
                                                    ),
                                                )}
                                                {cpa_plugins.map((plugin) => {
                                                    const info = pluginInfos.find(
                                                        (item) =>
                                                            item.instanceId === plugin.instanceId,
                                                    );
                                                    const items = info ? snapshot_items(info) : [];
                                                    const provider_set = new Set(
                                                        items.map((item) => item.provider),
                                                    );
                                                    const account_set = new Set(
                                                        items.map(
                                                            (item) =>
                                                                `${item.provider}:${item.accountId}`,
                                                        ),
                                                    );

                                                    const connector_status:
                                                        | "ok"
                                                        | "partial"
                                                        | "error"
                                                        | "disabled"
                                                        | "unknown" = plugin.enabled
                                                        ? info?.snapshot.status === "ready"
                                                            ? items.length > 0
                                                                ? "ok"
                                                                : "unknown"
                                                            : info?.snapshot.status === "failed"
                                                              ? items.length > 0
                                                                  ? "partial"
                                                                  : "error"
                                                              : "unknown"
                                                        : "disabled";

                                                    const fail_count = items.filter(
                                                        (item) => item.status === "critical",
                                                    ).length;

                                                    return (
                                                        <CpaCard
                                                            key={plugin.instanceId}
                                                            instance_id={plugin.instanceId}
                                                            display_name={
                                                                info?.displayName ?? "CPA Manager"
                                                            }
                                                            enabled={plugin.enabled}
                                                            status={connector_status}
                                                            source_count={provider_set.size}
                                                            account_count={account_set.size}
                                                            fail_count={fail_count}
                                                            rows={items.map((item) => ({
                                                                provider: item.provider,
                                                                account_id: item.accountId,
                                                                account_label: item.accountLabel,
                                                                status: "ok" as const,
                                                                is_hidden:
                                                                    config.accountOverrides?.hidden?.[
                                                                        item.provider
                                                                    ]?.includes(item.accountId) ??
                                                                    false,
                                                                is_removed: false,
                                                            }))}
                                                            on_toggle={() => {
                                                                void save_config({
                                                                    ...config,
                                                                    plugins: config.plugins.map(
                                                                        (pl) =>
                                                                            pl.instanceId ===
                                                                            plugin.instanceId
                                                                                ? {
                                                                                      ...pl,
                                                                                      enabled:
                                                                                          !pl.enabled,
                                                                                  }
                                                                                : pl,
                                                                    ),
                                                                });
                                                            }}
                                                            on_refresh={() => {
                                                                void window.usageboard.connector.refresh(
                                                                    plugin.instanceId,
                                                                );
                                                            }}
                                                            on_edit={() => {
                                                                setEditingCpaId(plugin.instanceId);
                                                            }}
                                                            on_delete={() => {
                                                                setRemoveCpaConfirmId(
                                                                    plugin.instanceId,
                                                                );
                                                                setRemoveCpaConfirmName(
                                                                    info?.displayName ??
                                                                        plugin.instanceId,
                                                                );
                                                            }}
                                                            on_hide={(target) => {
                                                                const item = items.find(
                                                                    (it) =>
                                                                        it.provider ===
                                                                            target.provider &&
                                                                        it.accountId ===
                                                                            target.account_id,
                                                                );
                                                                if (!item) return;
                                                                hide_account(item);
                                                            }}
                                                            on_unhide={(target) => {
                                                                restoreOverrideAccount(
                                                                    target.provider as UsageProvider,
                                                                    target.account_id,
                                                                    "hidden",
                                                                );
                                                            }}
                                                            on_clear={(target) => {
                                                                restoreOverrideAccount(
                                                                    target.provider as UsageProvider,
                                                                    target.account_id,
                                                                    "hidden",
                                                                );
                                                            }}
                                                        />
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()
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
                                <SetRow title="导出运行日志" sub="导出当前运行日志文件">
                                    <button
                                        className="set-select"
                                        style={{ background: "var(--field-bg)" }}
                                        type="button"
                                        onClick={() => {
                                            void handleExportLogs();
                                        }}
                                    >
                                        {dataMsg === "日志已导出" ? "已导出" : "导出日志"}
                                    </button>
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
                                    <div className="aa-ver">版本 {version}</div>
                                    <button className="btn-primary" type="button">
                                        <Icon name="refresh" size={15} color="#fff" />
                                        检查更新
                                    </button>
                                </div>
                                <div className="about-links">
                                    <button
                                        className="about-link-btn"
                                        type="button"
                                        onClick={() => {
                                            window.open("https://omniusage.app", "_blank");
                                        }}
                                    >
                                        官网
                                    </button>
                                    <button
                                        className="about-link-btn"
                                        type="button"
                                        onClick={() => {
                                            window.open("https://omniusage.app/docs", "_blank");
                                        }}
                                    >
                                        文档
                                    </button>
                                    <button
                                        className="about-link-btn"
                                        type="button"
                                        onClick={() => {
                                            window.open("https://omniusage.app/feedback", "_blank");
                                        }}
                                    >
                                        问卷反馈
                                    </button>
                                    <button
                                        className="about-link-btn"
                                        type="button"
                                        onClick={() => {
                                            window.open("https://omniusage.app/sponsor", "_blank");
                                        }}
                                    >
                                        支持作者
                                    </button>
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
                        existingLabelMap={
                            dialog.instanceId
                                ? (config.accountLabelMaps?.[dialog.instanceId] ?? {})
                                : undefined
                        }
                        onSaveLabelMap={async (id, map) => {
                            await save_config({
                                ...config,
                                accountLabelMaps: {
                                    ...(config.accountLabelMaps ?? {}),
                                    [id]: {
                                        ...(config.accountLabelMaps?.[id] ?? {}),
                                        ...map,
                                    },
                                },
                            });
                        }}
                        globalIntervalLabel={interval_label}
                    />
                )}
                {showCpaAdd && (
                    <CpaAddDialog
                        onClose={() => {
                            setShowCpaAdd(false);
                        }}
                    />
                )}
                {show_add_account_dialog && (
                    <AddAccountDialog
                        plugin_infos={pluginInfos}
                        has_cpa={pluginInfos.some((item) => item.source === "cpa")}
                        on_close={() => {
                            set_show_add_account_dialog(false);
                        }}
                        on_save={create_plugin_instance}
                        on_cpa={() => {
                            set_show_add_account_dialog(false);
                            setShowCpaAdd(true);
                        }}
                    />
                )}
                {label_map_dialog && (
                    <LabelMapDialog
                        instance_id={label_map_dialog.instance_id}
                        vendor_id={label_map_dialog.vendor_id}
                        account_name={label_map_dialog.account_name}
                        existing_map={
                            label_map_dialog.save_target === "provider"
                                ? (config.providerLabelMaps?.[label_map_dialog.vendor_id] ?? {})
                                : (config.accountLabelMaps?.[label_map_dialog.instance_id] ?? {})
                        }
                        on_save={async (instance_id, map) => {
                            if (label_map_dialog.save_target === "provider") {
                                await save_config({
                                    ...config,
                                    providerLabelMaps: {
                                        ...(config.providerLabelMaps ?? {}),
                                        [label_map_dialog.vendor_id]: map,
                                    },
                                });
                            } else {
                                await save_config({
                                    ...config,
                                    accountLabelMaps: {
                                        ...(config.accountLabelMaps ?? {}),
                                        [instance_id]: map,
                                    },
                                });
                            }
                            set_label_map_dialog(null);
                        }}
                        on_close={() => {
                            set_label_map_dialog(null);
                        }}
                    />
                )}
                {deleteConfirmId && (
                    <ConfirmDelete
                        name={deleteConfirmName}
                        onCancel={() => {
                            setDeleteConfirmId(null);
                        }}
                        onConfirm={() => {
                            void save_config({
                                ...config,
                                plugins: config.plugins.filter(
                                    (pl) => pl.instanceId !== deleteConfirmId,
                                ),
                            });
                            setDeleteConfirmId(null);
                        }}
                    />
                )}
                {removeCpaConfirmId && (
                    <ConfirmDelete
                        name={removeCpaConfirmName}
                        title="移除数据源"
                        confirmLabel="移除数据源"
                        onCancel={() => {
                            setRemoveCpaConfirmId(null);
                        }}
                        onConfirm={() => {
                            void save_config({
                                ...config,
                                plugins: config.plugins.filter(
                                    (pl) => pl.instanceId !== removeCpaConfirmId,
                                ),
                            });
                            setRemoveCpaConfirmId(null);
                            if (editingCpaId === removeCpaConfirmId) {
                                setEditingCpaId(null);
                            }
                        }}
                    />
                )}
            </div>
        </div>
    );
}

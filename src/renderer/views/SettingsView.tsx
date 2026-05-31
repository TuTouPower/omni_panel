import { useState, useEffect, useCallback } from "react";
import { useConfig } from "../hooks/use-config";
import { useTheme } from "../lib/theme";
import { SettingsForm } from "../components/SettingsForm";
import { CpaConnectorSettings } from "../components/CpaConnectorSettings";
import { Icon, VendorMark } from "../components/Icon";
import type { PluginInfo } from "../../shared/types/ipc";
import type { PluginConfiguration } from "../../shared/types/config";

/* ── types ── */
interface DialogState {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
}

/* ── constants ── */
const NAV_ITEMS = [
    { id: "general", label: "常规", icon: "gear" },
    { id: "accounts", label: "账号", icon: "inbox" },
    { id: "appearance", label: "外观", icon: "palette" },
    { id: "notify", label: "通知", icon: "bell" },
    { id: "data", label: "数据与隐私", icon: "shield" },
    { id: "about", label: "关于", icon: "info" },
] as const;

const ACCENTS = ["#3d7afd", "#6f5cf6", "#0ea5a3", "#f5772f", "#e23744"];

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

/* ── Add / Edit Account Dialog ── */
function AccountDialog({
    mode,
    instanceId,
    pluginName,
    pluginInfo,
    pluginConfig,
    hasSecrets,
    onSave,
    onSaveSecrets,
    onRefresh,
    onClose,
}: {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
    pluginInfo: PluginInfo | undefined;
    pluginConfig: PluginConfiguration | undefined;
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
            >
                <div className="ad-head">
                    <span className="ad-mark">
                        <VendorMark id="overview" size={24} />
                    </span>
                    <div className="ad-htext">
                        <div className="ad-title">{isEdit ? "编辑账号" : "添加账号"}</div>
                        <div className="ad-sub">
                            {pluginName ?? "新账号"}
                            {isEdit && pluginName ? ` · ${pluginName}` : ""}
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
                    ) : (
                        <div className="text-sm text-[var(--text-3)]">暂不支持在此添加新账号</div>
                    )}
                </div>
            </div>
        </div>
    );
}

/* ── Main View ── */
export function SettingsView() {
    useTheme();
    const { config, hasSecrets, loading, error, save, saveSecrets } = useConfig();
    const [pluginInfos, setPluginInfos] = useState<PluginInfo[]>([]);
    const [section, setSection] = useState("general");
    const [dialog, setDialog] = useState<DialogState | null>(null);

    // Local UI state for settings not yet backed by config
    const [localState, setLocalState] = useState({
        lang: "简体中文",
        interval: "5 分钟",
        pin: false,
        trayClick: "打开主面板",
        pauseRefresh: false,
        minToTray: true,
        cacheMax: "100 MB",
        notifyNear: true,
        notifyLimit: true,
        notifyFail: true,
        notifyWay: "系统通知",
    });
    const [accent, setAccent] = useState("#3d7afd");
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
            await save({
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
        [config, save, saveSecrets],
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
        window.location.hash = "#popup";
    };

    const isDark = document.documentElement.classList.contains("dark");
    const themeMode = isDark ? "dark" : "light";

    if (loading) {
        return (
            <div className="window">
                <div className="p-6 text-[var(--text-3)]">加载中...</div>
            </div>
        );
    }
    if (error) {
        return (
            <div className="window">
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
        <div className="window">
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
                                            void save({
                                                ...config,
                                                launchAtLogin: !config.launchAtLogin,
                                            });
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="启动后最小化到托盘">
                                    <Toggle
                                        on={localState.minToTray}
                                        onClick={() => {
                                            up("minToTray", !localState.minToTray);
                                        }}
                                    />
                                </SetRow>

                                <div className="set-group-label">刷新</div>
                                <SetRow title="自动刷新间隔" sub="后台轮询各服务用量的频率">
                                    <Select
                                        value={localState.interval}
                                        onChange={(v) => {
                                            up("interval", v);
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
                                        on={localState.pauseRefresh}
                                        onClick={() => {
                                            up("pauseRefresh", !localState.pauseRefresh);
                                        }}
                                    />
                                </SetRow>

                                <div className="set-group-label">窗口</div>
                                <SetRow title="窗口始终置顶">
                                    <Toggle
                                        on={localState.pin}
                                        onClick={() => {
                                            up("pin", !localState.pin);
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="点击托盘图标">
                                    <Select
                                        value={localState.trayClick}
                                        onChange={(v) => {
                                            up("trayClick", v);
                                        }}
                                        options={["打开主面板", "打开菜单"]}
                                    />
                                </SetRow>
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
                                <div className="acct-intro">
                                    关闭后该卡片不再显示在主面板，也会停止刷新用量。可随时在此重新启用。
                                </div>
                                {config.plugins.length === 0 ? (
                                    <div className="text-sm text-[var(--text-3)] py-4">
                                        暂无已配置的服务
                                    </div>
                                ) : (
                                    config.plugins.map((p) => {
                                        const pluginInfo = pluginInfos.find(
                                            (info) => info.instanceId === p.instanceId,
                                        );
                                        const displayName =
                                            pluginInfo?.source === "cpa"
                                                ? "CPA 额度连接器"
                                                : p.name;
                                        const isEnabled = p.enabled;
                                        const groupOff = !isEnabled;
                                        return (
                                            <div
                                                className={`acct-group${groupOff ? " off" : ""}`}
                                                key={p.instanceId}
                                            >
                                                <div className="acct-group-head">
                                                    <VendorMark id="overview" size={22} />
                                                    <span className="agh-name">{displayName}</span>
                                                    <button
                                                        className="agh-add"
                                                        title={`添加 ${displayName} 账号`}
                                                        onClick={() => {
                                                            setDialog({
                                                                mode: "add",
                                                                instanceId: undefined,
                                                                pluginName: displayName,
                                                            });
                                                        }}
                                                        type="button"
                                                    >
                                                        <Icon
                                                            name="plus"
                                                            size={16}
                                                            strokeWidth={2.2}
                                                        />
                                                    </button>
                                                    <Toggle
                                                        on={isEnabled}
                                                        onClick={() => {
                                                            void save({
                                                                ...config,
                                                                plugins: config.plugins.map((pl) =>
                                                                    pl.instanceId === p.instanceId
                                                                        ? {
                                                                              ...pl,
                                                                              enabled: !pl.enabled,
                                                                          }
                                                                        : pl,
                                                                ),
                                                            });
                                                        }}
                                                    />
                                                </div>
                                                <div className="acct-rows">
                                                    <div
                                                        className={`acct-row${groupOff ? " off" : ""}`}
                                                    >
                                                        <span
                                                            className={`ar-dot${groupOff ? " off" : ""}`}
                                                        />
                                                        <span className="ar-name">
                                                            {displayName}
                                                        </span>
                                                        {groupOff && (
                                                            <span className="ar-off">已关闭</span>
                                                        )}
                                                        <div className="ar-actions">
                                                            <button
                                                                className="icon-btn ar-ic"
                                                                title="编辑"
                                                                onClick={() => {
                                                                    setDialog({
                                                                        mode: "edit",
                                                                        instanceId: p.instanceId,
                                                                        pluginName: displayName,
                                                                    });
                                                                }}
                                                                type="button"
                                                            >
                                                                <Icon name="edit" size={15} />
                                                            </button>
                                                            <button
                                                                className="icon-btn ar-ic"
                                                                title="删除"
                                                                type="button"
                                                            >
                                                                <Icon name="trash" size={15} />
                                                            </button>
                                                            <Toggle
                                                                on={isEnabled}
                                                                disabled={groupOff}
                                                                onClick={() => {
                                                                    void save({
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
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
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
                                                    if (k === "system") {
                                                        const sysDark = window.matchMedia(
                                                            "(prefers-color-scheme: dark)",
                                                        ).matches;
                                                        document.documentElement.classList.toggle(
                                                            "dark",
                                                            sysDark,
                                                        );
                                                    } else {
                                                        document.documentElement.classList.toggle(
                                                            "dark",
                                                            k === "dark",
                                                        );
                                                    }
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
                                                className={`accent-sw${accent === c ? " on" : ""}`}
                                                style={{ background: c, color: c }}
                                                onClick={() => {
                                                    setAccent(c);
                                                }}
                                                type="button"
                                            />
                                        ))}
                                    </div>
                                </SetRow>
                            </>
                        )}

                        {/* ── Notify ── */}
                        {section === "notify" && (
                            <>
                                <div className="set-group-label">用量提醒</div>
                                <SetRow title="接近限制时提醒" sub="任一周期用量达到 80% 时">
                                    <Toggle
                                        on={localState.notifyNear}
                                        onClick={() => {
                                            up("notifyNear", !localState.notifyNear);
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="达到限制时提醒" sub="任一周期用量达到 100% 时">
                                    <Toggle
                                        on={localState.notifyLimit}
                                        onClick={() => {
                                            up("notifyLimit", !localState.notifyLimit);
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="刷新失败时提醒" sub="连续刷新失败或凭证失效时">
                                    <Toggle
                                        on={localState.notifyFail}
                                        onClick={() => {
                                            up("notifyFail", !localState.notifyFail);
                                        }}
                                    />
                                </SetRow>
                                <div className="set-group-label">方式</div>
                                <SetRow title="提醒方式">
                                    <Select
                                        value={localState.notifyWay}
                                        onChange={(v) => {
                                            up("notifyWay", v);
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
                                        value={localState.cacheMax}
                                        onChange={(v) => {
                                            up("cacheMax", v);
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
                                    <div className="aa-badge">
                                        <Icon name="grid_nav" size={28} color="#fff" />
                                    </div>
                                    <div className="aa-name">OmniUsage</div>
                                    <div className="aa-ver">版本 1.0.0 · 已是最新版本</div>
                                    <button className="btn-primary" type="button">
                                        <Icon name="refresh" size={15} color="#fff" />
                                        检查更新
                                    </button>
                                </div>
                                <div className="about-links">
                                    <SetRow title="更新日志">
                                        <Icon name="chevron" size={16} color="var(--text-3)" />
                                    </SetRow>
                                    <SetRow title="开源许可">
                                        <Icon name="chevron" size={16} color="var(--text-3)" />
                                    </SetRow>
                                    <SetRow title="反馈问题">
                                        <Icon name="chevron" size={16} color="var(--text-3)" />
                                    </SetRow>
                                    <SetRow title="访问官网">
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
                        hasSecrets={dialog.instanceId ? hasSecrets[dialog.instanceId] : undefined}
                        onSave={savePluginSettings}
                        onSaveSecrets={savePluginSecrets}
                        onRefresh={refreshPlugin}
                        onClose={() => {
                            setDialog(null);
                        }}
                    />
                )}
            </div>
        </div>
    );
}

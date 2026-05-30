import { useState, useEffect, useCallback } from "react";
import { useConfig } from "../hooks/use-config";
import { useTheme } from "../lib/theme";
import { Icon, VendorMark } from "../components/Icon";

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
function Toggle({ on, onClick, disabled }: { on: boolean; onClick: () => void; disabled?: boolean }) {
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
        <select className="set-select" value={value} onChange={(e) => { onChange(e.target.value); }}>
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
    pluginName,
    onClose,
}: {
    mode: "add" | "edit";
    instanceId: string | undefined;
    pluginName: string | undefined;
    onClose: () => void;
}) {
    const isEdit = mode === "edit";
    const [name, setName] = useState(pluginName ?? "");
    const [showKey, setShowKey] = useState(false);

    useEffect(() => {
        const h = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", h);
        return () => { window.removeEventListener("keydown", h); };
    }, [onClose]);

    const canSave = name.trim().length > 0;

    return (
        <div className="acct-dialog-scrim" onMouseDown={onClose}>
            <div className="acct-dialog" onMouseDown={(e) => { e.stopPropagation(); }} role="dialog">
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
                    <div className="ad-field">
                        <label className="ad-label">账号名称</label>
                        <input
                            className="ad-input"
                            value={name}
                            autoFocus
                            onChange={(e) => { setName(e.target.value); }}
                            placeholder="例如：工作账号"
                        />
                    </div>

                    <div className="ad-field">
                        <label className="ad-label">API 密钥</label>
                        <div className="ad-key">
                            <input
                                className="ad-input mono"
                                type={showKey ? "text" : "password"}
                                placeholder="sk-..."
                            />
                            <button
                                className="ad-eye"
                                onClick={() => { setShowKey((v) => !v); }}
                                title={showKey ? "隐藏" : "显示"}
                                type="button"
                            >
                                <Icon name={showKey ? "eye_off" : "eye"} size={16} />
                            </button>
                        </div>
                        <div className="ad-hint">
                            <Icon name="lock" size={12} strokeWidth={1.8} />
                            密钥仅加密保存在本地，用于读取用量数据
                        </div>
                    </div>

                    <div className="ad-field">
                        <label className="ad-label">
                            刷新频率
                        </label>
                        <select className="ad-select" defaultValue="跟随全局设置">
                            {["跟随全局设置", "1 分钟", "5 分钟", "15 分钟", "30 分钟", "仅手动"].map(
                                (o) => (
                                    <option key={o} value={o}>
                                        {o}
                                    </option>
                                ),
                            )}
                        </select>
                        <div className="ad-hint">
                            <Icon name="clock" size={12} strokeWidth={1.8} />
                            单独设置该账号的后台轮询间隔，覆盖全局设置
                        </div>
                    </div>

                    <div className="ad-field">
                        <label className="ad-label">
                            接口地址<span className="ad-opt">可选</span>
                        </label>
                        <input
                            className="ad-input mono"
                            placeholder="默认（官方接口）"
                        />
                    </div>
                </div>

                <div className="ad-foot">
                    <button className="ad-test" type="button">
                        <Icon name="refresh" size={14} strokeWidth={1.9} />
                        测试连接
                    </button>
                    <div className="ad-foot-r">
                        <button className="ad-btn ghost" onClick={onClose} type="button">
                            取消
                        </button>
                        <button
                            className={`ad-btn primary${canSave ? "" : " disabled"}`}
                            onClick={canSave ? onClose : undefined}
                            type="button"
                        >
                            {isEdit ? "保存" : "添加账号"}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ── Main View ── */
export function SettingsView() {
    useTheme();
    const { config, loading, error, save } = useConfig();
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

    const up = useCallback((k: string, v: unknown) => {
        setLocalState((p) => ({ ...p, [k]: v }));
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
                                onClick={() => { setSection(n.id); }}
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
                                <SetRow
                                    title="开机时自动启动"
                                    sub="登录系统后在后台运行并驻留托盘"
                                >
                                    <Toggle
                                        on={config.launchAtLogin}
                                        onClick={() => {
                                            void save({ ...config, launchAtLogin: !config.launchAtLogin });
                                        }}
                                    />
                                </SetRow>
                                <SetRow title="启动后最小化到托盘">
                                    <Toggle
                                        on={localState.minToTray}
                                        onClick={() => { up("minToTray", !localState.minToTray); }}
                                    />
                                </SetRow>

                                <div className="set-group-label">刷新</div>
                                <SetRow title="自动刷新间隔" sub="后台轮询各服务用量的频率">
                                    <Select
                                        value={localState.interval}
                                        onChange={(v) => { up("interval", v); }}
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
                                        onClick={() => { up("pauseRefresh", !localState.pauseRefresh); }}
                                    />
                                </SetRow>

                                <div className="set-group-label">窗口</div>
                                <SetRow title="窗口始终置顶">
                                    <Toggle
                                        on={localState.pin}
                                        onClick={() => { up("pin", !localState.pin); }}
                                    />
                                </SetRow>
                                <SetRow title="点击托盘图标">
                                    <Select
                                        value={localState.trayClick}
                                        onChange={(v) => { up("trayClick", v); }}
                                        options={["打开主面板", "打开菜单"]}
                                    />
                                </SetRow>
                                <SetRow title="界面语言">
                                    <Select
                                        value={localState.lang}
                                        onChange={(v) => { up("lang", v); }}
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
                                        const isEnabled = p.enabled;
                                        const groupOff = !isEnabled;
                                        return (
                                            <div
                                                className={`acct-group${groupOff ? " off" : ""}`}
                                                key={p.instanceId}
                                            >
                                                <div className="acct-group-head">
                                                    <VendorMark id="overview" size={22} />
                                                    <span className="agh-name">{p.name}</span>
                                                    <button
                                                        className="agh-add"
                                                        title={`添加 ${p.name} 账号`}
                                                        onClick={() =>
                                                            { setDialog({
                                                                mode: "add",
                                                                instanceId: undefined,
                                                                pluginName: p.name,
                                                            }); }
                                                        }
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
                                                <div className="acct-rows">
                                                    <div
                                                        className={`acct-row${groupOff ? " off" : ""}`}
                                                    >
                                                        <span
                                                            className={`ar-dot${groupOff ? " off" : ""}`}
                                                        />
                                                        <span className="ar-name">{p.name}</span>
                                                        {groupOff && (
                                                            <span className="ar-off">已关闭</span>
                                                        )}
                                                        <div className="ar-actions">
                                                            <button
                                                                className="icon-btn ar-ic"
                                                                title="编辑"
                                                                onClick={() =>
                                                                    { setDialog({
                                                                        mode: "edit",
                                                                        instanceId: p.instanceId,
                                                                        pluginName: p.name,
                                                                    }); }
                                                                }
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
                                                    (k === "system"
                                                        ? themeMode ===
                                                          (window.matchMedia(
                                                              "(prefers-color-scheme: dark)",
                                                          ).matches
                                                              ? "dark"
                                                              : "light")
                                                        : themeMode === k)
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
                                                onClick={() => { setAccent(c); }}
                                                type="button"
                                            />
                                        ))}
                                    </div>
                                </SetRow>

                                <div className="set-group-label">显示</div>
                                <SetRow
                                    title="总览布局"
                                    sub="分组：所有插件卡片堆叠显示；标签页：每次只显示一个插件"
                                >
                                    <div className="set-seg">
                                        {(
                                            [
                                                ["grouped", "分组"],
                                                ["tabs", "标签页"],
                                            ] as const
                                        ).map(([k, lb]) => (
                                            <button
                                                key={k}
                                                className={
                                                    config.overviewDisplayMode === k ? "on" : ""
                                                }
                                                onClick={() => {
                                                    void save({
                                                        ...config,
                                                        overviewDisplayMode: k,
                                                    });
                                                }}
                                                type="button"
                                            >
                                                {lb}
                                            </button>
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
                                        onClick={() => { up("notifyNear", !localState.notifyNear); }}
                                    />
                                </SetRow>
                                <SetRow title="达到限制时提醒" sub="任一周期用量达到 100% 时">
                                    <Toggle
                                        on={localState.notifyLimit}
                                        onClick={() => { up("notifyLimit", !localState.notifyLimit); }}
                                    />
                                </SetRow>
                                <SetRow title="刷新失败时提醒" sub="连续刷新失败或凭证失效时">
                                    <Toggle
                                        on={localState.notifyFail}
                                        onClick={() => { up("notifyFail", !localState.notifyFail); }}
                                    />
                                </SetRow>
                                <div className="set-group-label">方式</div>
                                <SetRow title="提醒方式">
                                    <Select
                                        value={localState.notifyWay}
                                        onChange={(v) => { up("notifyWay", v); }}
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
                                        onChange={(v) => { up("cacheMax", v); }}
                                        options={[
                                            "50 MB",
                                            "100 MB",
                                            "200 MB",
                                            "500 MB",
                                            "不限制",
                                        ]}
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
                                <SetRow title="导出用量数据" sub="导出为 CSV / JSON">
                                    <button
                                        className="set-select"
                                        style={{ background: "var(--field-bg)" }}
                                        type="button"
                                    >
                                        导出
                                    </button>
                                </SetRow>
                                <SetRow title="匿名使用统计" sub="帮助改进 OmniUsage，不含任何用量内容">
                                    <Toggle on={false} onClick={undefined} />
                                </SetRow>
                                <div
                                    className="set-group-label"
                                    style={{ color: "var(--red)" }}
                                >
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
                        onClose={() => { setDialog(null); }}
                    />
                )}
            </div>
        </div>
    );
}

import type { AppConfiguration } from "../../../../shared/types/config";
import { AliasEditor } from "../../../components/AliasEditor";
import { Select } from "../../../components/ui/Select";
import { SetGroupLabel, SetRow } from "../../../components/settings/SetRow";
import { Switch } from "../../../components/ui/Switch";
import { Input } from "../../../components/ui/Input";
import {
    REFRESH_INTERVAL_OPTIONS,
    refresh_label_to_seconds,
    refresh_seconds_to_label,
} from "../../../lib/refresh-intervals";
import {
    DEFAULT_RESUME_COMMAND_TEMPLATES,
    RESUME_COMMAND_SOURCES,
    type ResumeCommandSource,
} from "../../../lib/session-resume";
import {
    FLOATING_HEIGHT_MODE_LABELS,
    LOG_LEVEL_OPTIONS,
    MAIN_PANEL_MODE_LABELS,
    floating_height_mode_label_to_value,
    floating_height_mode_value_to_label,
    log_level_label_to_value,
    log_level_value_to_label,
    main_panel_mode_label_to_value,
    main_panel_mode_value_to_label,
} from "../lib";

const RESUME_SOURCE_TITLES: Record<ResumeCommandSource, string> = {
    claude_code: "Claude Code",
    kimi_code: "Kimi Code",
    grok: "Grok",
    opencode: "OpenCode",
};

function save_resume_template(
    config: AppConfiguration,
    save_config: (payload: AppConfiguration) => Promise<void>,
    source: ResumeCommandSource,
    raw: string,
): void {
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(config.resumeCommandTemplates ?? {})) {
        if (typeof v === "string") next[k] = v;
    }
    const val = raw.trim();
    if (val === "") {
        delete next[source];
    } else {
        next[source] = val;
    }
    const base = Object.fromEntries(
        Object.entries(config).filter(([k]) => k !== "resumeCommandTemplates"),
    );
    void save_config({
        ...(base as typeof config),
        ...(Object.keys(next).length > 0 ? { resumeCommandTemplates: next } : {}),
    });
}

export function GeneralSection({
    config,
    has_multi_account,
    language,
    on_language_change,
    save_config,
}: {
    config: AppConfiguration;
    has_multi_account: boolean;
    language: string;
    on_language_change: (value: string) => void;
    save_config: (payload: AppConfiguration) => Promise<void>;
}) {
    const pinToTop = config.pinToTop ?? false;
    const mainPanelMode = config.mainPanelMode ?? "system";
    const floatingHeightMode = config.floatingHeightMode ?? "fixed";
    const effectiveMainPanelMode =
        mainPanelMode === "system"
            ? window.usageboard.platform === "darwin"
                ? "popup"
                : "floating"
            : mainPanelMode;
    const minimizeToTray = config.minimizeToTray ?? true;
    const globalIntervalSeconds = config.globalRefreshIntervalSeconds ?? 300;
    const logLevel = config.logLevel ?? (import.meta.env.DEV ? "debug" : "info");
    const interval_label = refresh_seconds_to_label(globalIntervalSeconds);

    return (
        <>
            <SetGroupLabel>启动</SetGroupLabel>
            <SetRow title="开机时自动启动" sub="登录系统后在后台运行并驻留托盘">
                <Switch
                    checked={config.launchAtLogin}
                    onChange={() => {
                        void save_config({
                            ...config,
                            launchAtLogin: !config.launchAtLogin,
                        });
                    }}
                />
            </SetRow>
            <SetRow title="启动后最小化到托盘">
                <Switch
                    checked={minimizeToTray}
                    onChange={() => {
                        void save_config({
                            ...config,
                            minimizeToTray: !minimizeToTray,
                        });
                    }}
                />
            </SetRow>

            <SetGroupLabel>刷新</SetGroupLabel>
            <SetRow title="自动刷新间隔" sub="后台轮询各服务用量的频率">
                <Select
                    value={interval_label}
                    onChange={(e) => {
                        void save_config({
                            ...config,
                            globalRefreshIntervalSeconds: refresh_label_to_seconds(e.target.value),
                        });
                    }}
                >
                    {REFRESH_INTERVAL_OPTIONS.map((opt) => (
                        <option key={opt.label} value={opt.label}>
                            {opt.label}
                        </option>
                    ))}
                </Select>
            </SetRow>

            <SetGroupLabel>诊断</SetGroupLabel>
            <SetRow title="日志等级" sub="Debug 记录最多，Info 适合日常诊断">
                <Select
                    aria-label="日志等级"
                    value={log_level_value_to_label(logLevel)}
                    onChange={(e) => {
                        void save_config({
                            ...config,
                            logLevel: log_level_label_to_value(e.target.value),
                        });
                    }}
                >
                    {LOG_LEVEL_OPTIONS.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </Select>
            </SetRow>

            <SetGroupLabel>网络</SetGroupLabel>
            <SetRow title="代理地址" sub="HTTP/HTTPS/SOCKS 代理，留空直连">
                <Input
                    className="font-[var(--font-code-md)]"
                    value={config.proxy?.url ?? ""}
                    onChange={(e) => {
                        const val = e.target.value.trim();
                        if (val) {
                            try {
                                const parsed = new URL(val);
                                if (!["http:", "https:", "socks:"].includes(parsed.protocol))
                                    return;
                            } catch {
                                return;
                            }
                        }
                        const base = Object.fromEntries(
                            Object.entries(config).filter(([k]) => k !== "proxy"),
                        );
                        void save_config({
                            ...(base as typeof config),
                            ...(val ? { proxy: { url: val } } : {}),
                        });
                    }}
                    placeholder="留空表示直连"
                />
            </SetRow>

            <SetGroupLabel>窗口</SetGroupLabel>
            <SetRow title="用量面板打开方式" sub="左键托盘图标永远打开用量面板，外壳由这里决定">
                <Select
                    value={main_panel_mode_value_to_label(mainPanelMode)}
                    onChange={(e) => {
                        void save_config({
                            ...config,
                            mainPanelMode: main_panel_mode_label_to_value(e.target.value),
                        });
                    }}
                >
                    {MAIN_PANEL_MODE_LABELS.map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </Select>
            </SetRow>
            <SetRow title="窗口始终置顶">
                <Switch
                    checked={pinToTop}
                    onChange={() => {
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
                        value={floating_height_mode_value_to_label(floatingHeightMode)}
                        onChange={(e) => {
                            void save_config({
                                ...config,
                                floatingHeightMode: floating_height_mode_label_to_value(
                                    e.target.value,
                                ),
                            });
                        }}
                    >
                        {FLOATING_HEIGHT_MODE_LABELS.map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                    </Select>
                </SetRow>
            )}
            <SetRow title="界面语言">
                <Select
                    value={language}
                    onChange={(e) => {
                        on_language_change(e.target.value);
                    }}
                >
                    {["简体中文", "English", "跟随系统"].map((o) => (
                        <option key={o} value={o}>
                            {o}
                        </option>
                    ))}
                </Select>
            </SetRow>
            <SetGroupLabel>会话续接命令</SetGroupLabel>
            <SetRow
                title="命令模板"
                sub="点击 session ID 时复制的命令；用 {session_id} 占位。留空使用内置默认"
            >
                <span aria-hidden="true" />
            </SetRow>
            {RESUME_COMMAND_SOURCES.map((source) => (
                <SetRow key={source} title={RESUME_SOURCE_TITLES[source]} sub={source}>
                    <Input
                        aria-label={`续接命令 ${source}`}
                        className="min-w-[220px] font-[var(--font-code-md)]"
                        value={config.resumeCommandTemplates?.[source] ?? ""}
                        placeholder={DEFAULT_RESUME_COMMAND_TEMPLATES[source]}
                        onChange={(e) => {
                            save_resume_template(config, save_config, source, e.target.value);
                        }}
                    />
                </SetRow>
            ))}

            <SetGroupLabel>其他</SetGroupLabel>
            <SetRow title="界面脱敏" sub="隐藏所有账号备注名（用量面板与设置面板）">
                <Switch
                    checked={config.uiDesensitizeRemarks === true}
                    onChange={() => {
                        void save_config({
                            ...config,
                            uiDesensitizeRemarks: config.uiDesensitizeRemarks !== true,
                        });
                    }}
                />
            </SetRow>
            <AliasEditor
                label="目录别名"
                itemLabel="目录"
                entries={(config.dirAliases ?? []).map((a) => ({
                    alias: a.alias,
                    values: [...a.dirs],
                }))}
                onChange={(next) => {
                    void save_config({
                        ...config,
                        dirAliases: next.map((e) => ({
                            alias: e.alias,
                            dirs: e.values,
                        })),
                    });
                }}
            />
            <AliasEditor
                label="模型别名"
                itemLabel="模型"
                entries={(config.modelAliases ?? []).map((a) => ({
                    alias: a.alias,
                    values: [...a.models],
                }))}
                onChange={(next) => {
                    void save_config({
                        ...config,
                        modelAliases: next.map((e) => ({
                            alias: e.alias,
                            models: e.values,
                        })),
                    });
                }}
            />
            <SetRow
                title="同一厂商的数据标签映射同步"
                sub="同一厂商下的多个账号共用一套数据标签映射，编辑任一账号即同步到全部"
            >
                <span aria-hidden="true" />
            </SetRow>
            {has_multi_account && (
                <SetRow
                    title="概览时间窗口"
                    sub="多账号服务概览中，各账号采集时间差在此范围内才显示更新时间"
                >
                    <Select
                        value={`${String(config.convergentTimeMinutes ?? 30)} 分钟`}
                        onChange={(e) => {
                            const min = parseInt(e.target.value, 10);
                            if (!isNaN(min)) {
                                void save_config({
                                    ...config,
                                    convergentTimeMinutes: min,
                                });
                            }
                        }}
                    >
                        {["10 分钟", "20 分钟", "30 分钟", "60 分钟", "120 分钟"].map((o) => (
                            <option key={o} value={o}>
                                {o}
                            </option>
                        ))}
                    </Select>
                </SetRow>
            )}
            <SetRow
                title="即将重置提醒阈值"
                sub="重置时间剩余占周期的百分之多少时在即将重置面板展示；留空表示不监控"
            >
                <Input
                    type="number"
                    min={0}
                    max={100}
                    style={{ width: 80 }}
                    value={
                        config.upcomingResetThresholdPercent === null ||
                        config.upcomingResetThresholdPercent === undefined
                            ? ""
                            : String(config.upcomingResetThresholdPercent)
                    }
                    onChange={(e) => {
                        const val = e.target.value.trim();
                        if (val === "") {
                            void save_config({
                                ...config,
                                upcomingResetThresholdPercent: null,
                            });
                            return;
                        }
                        const num = parseInt(val, 10);
                        if (!isNaN(num) && num >= 0 && num <= 100) {
                            void save_config({
                                ...config,
                                upcomingResetThresholdPercent: num,
                            });
                        }
                    }}
                    placeholder="留空"
                />
            </SetRow>
        </>
    );
}

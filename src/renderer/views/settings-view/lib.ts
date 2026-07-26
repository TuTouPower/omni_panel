import type {
    FloatingHeightMode,
    LogLevel,
    MainPanelMode,
    UsageBarColorScheme,
    UsageBarStyle,
} from "../../../shared/types/config";
import type { ConnectorInfo } from "../../../shared/types/ipc";
import type { MetricRecord } from "../../../shared/schemas/plugin-output";
import { createLogger } from "../../../shared/lib/logger";

/* ── constants ── */
export const BAR_COLOR_SCHEMES: {
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

export const MAIN_PANEL_MODE_LABELS = ["跟随系统推荐", "弹出面板", "浮动窗口"] as const;
export const FLOATING_HEIGHT_MODE_LABELS = ["保持窗口大小", "跟随内容变化"] as const;
export const BAR_STYLE_LABELS = ["细线型", "粗胶囊型"] as const;
export const LOG_LEVEL_OPTIONS = ["Debug", "Info", "Warn", "Error"];

export const log = createLogger("renderer:settings-view");
export const should_log_raw = import.meta.env.DEV;

/**
 * Fire-and-forget background refresh after save. Never blocks the save path,
 * never throws to the caller. Logs errors instead.
 */
export function trigger_background_refresh(instance_id: string): void {
    try {
        const result = window.usageboard.connector.refresh(instance_id);
        Promise.resolve(result).catch((err: unknown) => {
            log.error("background refresh failed", { instanceId: instance_id, err });
        });
    } catch (err) {
        log.error("background refresh threw", { instanceId: instance_id, err });
    }
}

export function main_panel_mode_label_to_value(label: string): MainPanelMode {
    if (label === "弹出面板") return "popup";
    if (label === "浮动窗口") return "floating";
    return "system";
}

export function main_panel_mode_value_to_label(value: MainPanelMode | undefined): string {
    if (value === "popup") return "弹出面板";
    if (value === "floating") return "浮动窗口";
    return "跟随系统推荐";
}

export function floating_height_mode_label_to_value(label: string): FloatingHeightMode {
    return label === "跟随内容变化" ? "followContent" : "fixed";
}

export function floating_height_mode_value_to_label(value: FloatingHeightMode | undefined): string {
    return value === "followContent" ? "跟随内容变化" : "保持窗口大小";
}

export function log_level_label_to_value(label: string): LogLevel {
    if (label === "Info") return "info";
    if (label === "Warn") return "warn";
    if (label === "Error") return "error";
    return "debug";
}

export function log_level_value_to_label(value: LogLevel): string {
    if (value === "info") return "Info";
    if (value === "warn") return "Warn";
    if (value === "error") return "Error";
    return "Debug";
}

export function bar_style_label_to_value(label: string): UsageBarStyle {
    return label === "粗胶囊型" ? "capsule" : "thin";
}

export function snapshot_items(pluginInfo: ConnectorInfo): readonly MetricRecord[] {
    if (pluginInfo.snapshot.status === "ready") return pluginInfo.snapshot.items;
    if (pluginInfo.snapshot.status === "failed") return pluginInfo.snapshot.items ?? [];
    return [];
}

export function connection_status(pluginInfo: ConnectorInfo, enabled: boolean): string {
    if (!enabled) return "已停用";
    if (pluginInfo.snapshot.status === "ready") return "正常";
    if (pluginInfo.snapshot.status === "failed") return "异常";
    return "未连接";
}

export function map_status(status: string): "ok" | "error" | "disabled" | "unknown" {
    if (status === "正常") return "ok";
    if (status === "异常") return "error";
    if (status === "已停用") return "disabled";
    return "unknown";
}

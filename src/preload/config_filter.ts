/**
 * Popup 窗口保存配置字段白名单过滤 (A140)。
 * 仅允许 Popup 窗口持久化 UI 偏好及非敏感配置字段，
 * 拦截并丢弃针对 plugins, proxy 等核心敏感字段的越权写操作。
 */
export const POPUP_ALLOWED_CONFIG_KEYS = new Set<string>([
    "providerOrder",
    "accountOrders",
    "collapsedAccounts",
    "expandedProviders",
    "providerL2Open",
    "activeUsageTab",
    "sparklineWindowDays",
    "accountOverrides",
    "theme",
    "usageBarColorScheme",
    "usageBarStyle",
    "convergentTimeMinutes",
    "accountLabels",
    "accountLabelMaps",
    "providerLabelMaps",
    "uiDesensitizeRemarks",
    "providerForcePercent",
    "upcomingResetThresholdPercent",
]);

export function filter_popup_config_save(
    input_config: Record<string, unknown>,
    current_config: Record<string, unknown>,
): Record<string, unknown> {
    const result: Record<string, unknown> = { ...current_config };
    for (const [key, value] of Object.entries(input_config)) {
        if (POPUP_ALLOWED_CONFIG_KEYS.has(key)) {
            result[key] = value;
        }
    }
    return result;
}

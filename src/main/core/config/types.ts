import { z } from "zod/v3";
import type { AppLanguage } from "../../../shared/types/plugin";
import type { AppConfiguration } from "../../../shared/types/config";

export type { AppConfiguration, ConnectorConfiguration } from "../../../shared/types/config";
// eslint-disable-next-line @typescript-eslint/no-deprecated -- backward-compatible re-export
export type { PluginConfiguration } from "../../../shared/types/config";

const appLanguageSchema = z.enum(["zh-Hans", "en"]) as z.ZodType<AppLanguage>;

const REFRESH_INTERVAL_MIN = 60;
const REFRESH_INTERVAL_MAX = 172800;

// 「跟随全局」用 0 作 sentinel。schema 必须放行 0，且 preprocess 不能把它
// clamp 成 60，否则「跟随全局」开关一旦保存就被改写，重开又变回关闭。
// 非 sentinel 值仍然 clamp 到 [60, 172800]，保护历史损坏配置不导致整份
// config 被丢弃。
const refreshIntervalSecondsSchema = z.preprocess(
    (value) => {
        if (typeof value === "number" && Number.isFinite(value)) {
            const truncated = Math.trunc(value);
            if (truncated === 0) return 0;
            return Math.min(REFRESH_INTERVAL_MAX, Math.max(REFRESH_INTERVAL_MIN, truncated));
        }
        return value;
    },
    z
        .number()
        .int()
        .refine(
            (n) => n === 0 || (n >= REFRESH_INTERVAL_MIN && n <= REFRESH_INTERVAL_MAX),
            "must be 0 (follow global) or in [60, 172800]",
        ),
);

const connectorConfigurationSchema = z.object({
    instanceId: z.string().min(1).optional(),
    stateId: z.string().min(1),
    name: z.string().min(1),
    displayName: z.string().optional(),
    enabled: z.boolean(),
    executablePath: z.string().min(1),
    refreshIntervalSeconds: refreshIntervalSecondsSchema,
    manualRefreshOnly: z.boolean().optional(),
    parameterValues: z.record(z.string().or(z.number())),
    endpointOverrides: z.record(z.string()).default({}),
});

const proxyConfigurationSchema = z.object({
    url: z.string().min(1),
    noProxy: z.array(z.string()).optional(),
});

const mainPanelModeSchema = z.enum(["system", "popup", "floating"]);
const floatingHeightModeSchema = z.enum(["fixed", "followContent"]);
const usageBarColorSchemeSchema = z.enum(["risk-current", "risk-projected", "nine-cycle"]);
const usageBarStyleSchema = z.enum(["thin", "capsule"]);
const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);
const floatingBoundsSchema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().int().min(320),
    height: z.number().int().min(240),
    displayId: z.string().optional(),
});

const accountOverridesSchema = z.object({
    hidden: z.record(z.array(z.string())).optional(),
});

export const appConfigurationSchema = z.object({
    schemaVersion: z.number().int(),
    language: appLanguageSchema,
    plugins: z.array(connectorConfigurationSchema),
    launchAtLogin: z.boolean(),
    proxy: proxyConfigurationSchema.optional(),
    accentColor: z.string().optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    logLevel: logLevelSchema.optional(),
    pinToTop: z.boolean().optional(),
    minimizeToTray: z.boolean().optional(),
    globalRefreshIntervalSeconds: z.number().int().min(1).optional(),
    pauseAutoRefresh: z.boolean().optional(),
    providerOrder: z.array(z.string()).optional(),
    accountOrders: z.record(z.array(z.string())).optional(),
    cacheMaxMb: z.number().int().min(1).max(10000).optional(),
    mainPanelMode: mainPanelModeSchema.optional(),
    floatingHeightMode: floatingHeightModeSchema.optional(),
    usageBarColorScheme: usageBarColorSchemeSchema.optional(),
    usageBarStyle: usageBarStyleSchema.optional(),
    // Nested records have no depth/size limit. A malicious config import with
    // extremely deep or wide label maps could cause memory issues. Acceptable
    // for now because config is user-authored locally, not from untrusted input.
    providerLabelMaps: z.record(z.record(z.string())).optional(),
    accountLabelMaps: z.record(z.record(z.string())).optional(),
    labelMapSync: z.boolean().optional(),
    uiDesensitizeRemarks: z.boolean().optional(),
    providerForcePercent: z.record(z.boolean()).optional(),
    floatingBounds: floatingBoundsSchema.optional(),
    settingsBounds: floatingBoundsSchema.optional(),
    accountOverrides: accountOverridesSchema.optional(),
    accountLabels: z.record(z.record(z.string())).optional(),
    collapsedAccounts: z.record(z.boolean()).optional(),
    expandedProviders: z.record(z.boolean()).optional(),
    convergentTimeMinutes: z.number().int().min(1).max(1440).optional(),
    dirAliases: z
        .array(z.object({ alias: z.string().min(1), dirs: z.array(z.string()) }))
        .default([]),
    modelAliases: z
        .array(z.object({ alias: z.string().min(1), models: z.array(z.string()) }))
        .default([]),
    removedConnectorIds: z.array(z.string()).optional(),
});

export const DEFAULT_CONFIGURATION: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

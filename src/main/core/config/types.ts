import { z } from "zod/v3";
import type { AppLanguage } from "../../../shared/types/plugin";
import type { AppConfiguration } from "../../../shared/types/config";

export type { AppConfiguration, PluginConfiguration } from "../../../shared/types/config";

const appLanguageSchema = z.enum(["zh-Hans", "en"]) as z.ZodType<AppLanguage>;

const REFRESH_INTERVAL_MIN = 60;
const REFRESH_INTERVAL_MAX = 3600;

// Migration guard: clamp out-of-range refreshIntervalSeconds into [60, 3600]
// instead of rejecting the whole plugin (and, transitively, the whole config
// file). Older builds wrote values like 30 or 7200; without clamping those
// entries caused load() to fall back to DEFAULT_CONFIGURATION and silently
// wipe every plugin the user had configured.
const refreshIntervalSecondsSchema = z.preprocess((value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return Math.min(REFRESH_INTERVAL_MAX, Math.max(REFRESH_INTERVAL_MIN, Math.trunc(value)));
    }
    return value;
}, z.number().int().min(REFRESH_INTERVAL_MIN).max(REFRESH_INTERVAL_MAX));

const pluginConfigurationSchema = z.object({
    instanceId: z.string().min(1).optional(),
    stateId: z.string().min(1),
    name: z.string().min(1),
    enabled: z.boolean(),
    executablePath: z.string().min(1),
    refreshIntervalSeconds: refreshIntervalSecondsSchema,
    parameterValues: z.record(z.string()),
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
const floatingBoundsSchema = z.object({
    x: z.number().finite(),
    y: z.number().finite(),
    width: z.number().int().min(320),
    height: z.number().int().min(240),
    displayId: z.string().optional(),
});

export const appConfigurationSchema = z.object({
    schemaVersion: z.number().int(),
    language: appLanguageSchema,
    plugins: z.array(pluginConfigurationSchema),
    launchAtLogin: z.boolean(),
    proxy: proxyConfigurationSchema.optional(),
    accentColor: z.string().optional(),
    theme: z.enum(["light", "dark", "system"]).optional(),
    pinToTop: z.boolean().optional(),
    minimizeToTray: z.boolean().optional(),
    globalRefreshIntervalSeconds: z.number().int().min(1).optional(),
    pauseAutoRefresh: z.boolean().optional(),
    providerOrder: z.array(z.string()).optional(),
    cacheMaxMb: z.number().positive().optional(),
    mainPanelMode: mainPanelModeSchema.optional(),
    floatingHeightMode: floatingHeightModeSchema.optional(),
    usageBarColorScheme: usageBarColorSchemeSchema.optional(),
    usageBarStyle: usageBarStyleSchema.optional(),
    providerLabelMaps: z.record(z.record(z.string())).optional(),
    accountLabelMaps: z.record(z.record(z.string())).optional(),
    floatingBounds: floatingBoundsSchema.optional(),
    cookieRefreshHours: z
        .number()
        .int()
        .refine((v) => [0, 6, 12, 24].includes(v), {
            message: "cookieRefreshHours must be 0, 6, 12, or 24",
        })
        .optional(),
});

export const DEFAULT_CONFIGURATION: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
    cookieRefreshHours: 24,
};

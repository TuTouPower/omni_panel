import { z } from "zod/v3";
import type { AppLanguage } from "../../../shared/types/plugin";
import type { AppConfiguration } from "../../../shared/types/config";
import {
    USAGE_LABEL_MAP_MAX_ENTRIES,
    USAGE_LABEL_MAP_MAX_KEY_LENGTH,
    USAGE_LABEL_MAP_MAX_VALUE_LENGTH,
} from "../../../shared/types/config";

export type { AppConfiguration, PluginConfiguration } from "../../../shared/types/config";

const appLanguageSchema = z.enum(["zh-Hans", "en"]) as z.ZodType<AppLanguage>;

const pluginConfigurationSchema = z.object({
    instanceId: z.string().min(1).optional(),
    stateId: z.string().min(1),
    name: z.string().min(1),
    enabled: z.boolean(),
    executablePath: z.string().min(1),
    refreshIntervalSeconds: z.number().int().min(60).max(3600),
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
const usageLabelMapSchema = z
    .record(z.string().min(1).max(USAGE_LABEL_MAP_MAX_VALUE_LENGTH))
    .refine(
        (value) =>
            Object.keys(value).length <= USAGE_LABEL_MAP_MAX_ENTRIES &&
            Object.keys(value).every((key) => key.length <= USAGE_LABEL_MAP_MAX_KEY_LENGTH),
    );
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
    notifyNearLimit: z.boolean().optional(),
    notifyAtLimit: z.boolean().optional(),
    notifyOnFail: z.boolean().optional(),
    notifyMethod: z.string().optional(),
    cacheMaxMb: z.number().positive().optional(),
    mainPanelMode: mainPanelModeSchema.optional(),
    floatingHeightMode: floatingHeightModeSchema.optional(),
    usageBarColorScheme: usageBarColorSchemeSchema.optional(),
    usageBarStyle: usageBarStyleSchema.optional(),
    usageLabelMap: usageLabelMapSchema.optional(),
    accountLabelMaps: z.record(z.record(z.string())).optional(),
    floatingBounds: floatingBoundsSchema.optional(),
});

export const DEFAULT_CONFIGURATION: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

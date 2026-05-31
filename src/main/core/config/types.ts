import { z } from "zod/v3";
import type { AppLanguage } from "../../../shared/types/plugin";
import type { AppConfiguration } from "../../../shared/types/config";

export type { AppConfiguration, PluginConfiguration } from "../../../shared/types/config";

export const appLanguageSchema = z.enum(["zh-Hans", "en"]) as z.ZodType<AppLanguage>;

export const pluginConfigurationSchema = z.object({
    instanceId: z.string().min(1).optional(),
    stateId: z.string().min(1),
    name: z.string().min(1),
    enabled: z.boolean(),
    executablePath: z.string().min(1),
    refreshIntervalSeconds: z.number().int().min(60).max(3600),
    parameterValues: z.record(z.string()),
    endpointOverrides: z.record(z.string()).default({}),
});

export const proxyConfigurationSchema = z.object({
    url: z.string().min(1),
    noProxy: z.array(z.string()).optional(),
});

export const appConfigurationSchema = z.object({
    schemaVersion: z.number().int(),
    language: appLanguageSchema,
    plugins: z.array(pluginConfigurationSchema),
    launchAtLogin: z.boolean(),
    proxy: proxyConfigurationSchema.optional(),
});

export const DEFAULT_CONFIGURATION: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    plugins: [],
    launchAtLogin: false,
};

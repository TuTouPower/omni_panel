import { z } from "zod/v3";
import type { AppLanguage } from "../../../shared/types/plugin";

export const appLanguageSchema = z.enum(["zh-Hans", "en"]) as z.ZodType<AppLanguage>;

export const pluginConfigurationSchema = z.object({
    stateId: z.string().min(1),
    name: z.string().min(1),
    enabled: z.boolean(),
    executablePath: z.string().min(1),
    refreshIntervalSeconds: z.number().int().min(1),
    parameterValues: z.record(z.string()),
});

export const appConfigurationSchema = z.object({
    schemaVersion: z.number().int(),
    language: appLanguageSchema,
    overviewDisplayMode: z.enum(["grouped", "tabs"]),
    plugins: z.array(pluginConfigurationSchema),
    launchAtLogin: z.boolean(),
});

export interface AppConfiguration {
    readonly schemaVersion: number;
    readonly language: AppLanguage;
    readonly overviewDisplayMode: "grouped" | "tabs";
    readonly plugins: readonly PluginConfiguration[];
    readonly launchAtLogin: boolean;
}

export interface PluginConfiguration {
    readonly stateId: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly executablePath: string;
    readonly refreshIntervalSeconds: number;
    readonly parameterValues: Readonly<Record<string, string>>;
}

export const DEFAULT_CONFIGURATION: AppConfiguration = {
    schemaVersion: 1,
    language: "zh-Hans",
    overviewDisplayMode: "tabs",
    plugins: [],
    launchAtLogin: false,
};

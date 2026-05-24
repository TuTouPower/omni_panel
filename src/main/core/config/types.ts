import type { AppLanguage } from "../../../shared/types/plugin";

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

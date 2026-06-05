import type { AppLanguage } from "./plugin";
import type { UsageProvider } from "../schemas/plugin-output";

export interface ProxyConfiguration {
    readonly url: string;
    readonly noProxy?: readonly string[];
}

export type MainPanelMode = "system" | "popup" | "floating";
export type FloatingHeightMode = "fixed" | "followContent";

export interface FloatingBoundsConfiguration {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly displayId?: string;
}

export interface AccountOverrides {
    readonly hidden?: Readonly<Record<UsageProvider, readonly string[]>>;
    readonly disabled?: Readonly<Record<UsageProvider, readonly string[]>>;
}

export interface AppConfiguration {
    readonly schemaVersion: number;
    readonly language: AppLanguage;
    readonly plugins: readonly PluginConfiguration[];
    readonly launchAtLogin: boolean;
    readonly proxy?: ProxyConfiguration;
    readonly accentColor?: string;
    readonly theme?: "light" | "dark" | "system";
    readonly pinToTop?: boolean;
    readonly minimizeToTray?: boolean;
    readonly globalRefreshIntervalSeconds?: number;
    readonly pauseAutoRefresh?: boolean;
    readonly providerOrder?: readonly string[];
    readonly notifyNearLimit?: boolean;
    readonly notifyAtLimit?: boolean;
    readonly notifyOnFail?: boolean;
    readonly notifyMethod?: string;
    readonly cacheMaxMb?: number;
    readonly mainPanelMode?: MainPanelMode;
    readonly floatingHeightMode?: FloatingHeightMode;
    readonly floatingBounds?: FloatingBoundsConfiguration;
    readonly accountOverrides?: AccountOverrides;
}

export interface PluginConfiguration {
    readonly instanceId: string;
    readonly stateId: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly executablePath: string;
    readonly refreshIntervalSeconds: number;
    readonly parameterValues: Readonly<Record<string, string>>;
    readonly endpointOverrides: Readonly<Record<string, string>>;
}

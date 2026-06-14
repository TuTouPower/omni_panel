import type { AppLanguage } from "./plugin";
import type { UsageProvider } from "../schemas/plugin-output";

export interface ProxyConfiguration {
    readonly url: string;
    readonly noProxy?: readonly string[];
}

export type MainPanelMode = "system" | "popup" | "floating";
export type FloatingHeightMode = "fixed" | "followContent";
export type UsageBarColorScheme = "risk-current" | "risk-projected" | "nine-cycle";
export type UsageBarStyle = "thin" | "capsule";

export interface FloatingBoundsConfiguration {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly displayId?: string;
}

export interface AccountOverrides {
    readonly hidden?: Readonly<Partial<Record<UsageProvider, readonly string[]>>>;
    readonly disabled?: Readonly<Partial<Record<UsageProvider, readonly string[]>>>;
}

export interface AppConfiguration {
    readonly schemaVersion: number;
    readonly language: AppLanguage;
    readonly plugins: readonly ConnectorConfiguration[];
    readonly launchAtLogin: boolean;
    readonly proxy?: ProxyConfiguration;
    readonly accentColor?: string;
    readonly theme?: "light" | "dark" | "system";
    readonly pinToTop?: boolean;
    readonly minimizeToTray?: boolean;
    readonly globalRefreshIntervalSeconds?: number;
    readonly pauseAutoRefresh?: boolean;
    readonly providerOrder?: readonly string[];
    readonly cacheMaxMb?: number;
    readonly mainPanelMode?: MainPanelMode;
    readonly floatingHeightMode?: FloatingHeightMode;
    readonly usageBarColorScheme?: UsageBarColorScheme;
    readonly usageBarStyle?: UsageBarStyle;
    readonly providerLabelMaps?: Readonly<
        Partial<Record<UsageProvider, Readonly<Record<string, string>>>>
    >;
    readonly accountLabelMaps?: Readonly<Record<string, Readonly<Record<string, string>>>>;
    readonly labelMapSync?: boolean;
    readonly floatingBounds?: FloatingBoundsConfiguration;
    readonly accountOverrides?: AccountOverrides;
    readonly collapsedAccounts?: Readonly<Record<string, boolean>>;
    readonly expandedProviders?: Readonly<Record<string, boolean>>;
}

export interface ConnectorConfiguration {
    readonly instanceId: string;
    readonly stateId: string;
    readonly name: string;
    readonly enabled: boolean;
    readonly executablePath: string;
    readonly refreshIntervalSeconds: number;
    readonly manualRefreshOnly?: boolean;
    readonly parameterValues: Readonly<Record<string, string>>;
    readonly endpointOverrides: Readonly<Record<string, string>>;
}

/** @deprecated Use ConnectorConfiguration */
export type PluginConfiguration = ConnectorConfiguration;

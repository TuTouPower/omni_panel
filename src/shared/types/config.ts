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
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface FloatingBoundsConfiguration {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
    readonly displayId?: string;
}

export interface AccountOverrides {
    readonly hidden?: Readonly<Partial<Record<UsageProvider, readonly string[]>>>;
    /**
     * t043: 显式开启「即将重置」监控的 (provider → accountKey → raw_label[])。
     * 缺省/空 = 全关；用户在主面板 metric 行逐个显式开启。
     */
    readonly upcomingResetWatched?: Readonly<
        Partial<Record<UsageProvider, Readonly<Partial<Record<string, readonly string[]>>>>>
    >;
}

export type AccountLabels = Readonly<
    Partial<Record<UsageProvider, Readonly<Record<string, string>>>>
>;

export interface AppConfiguration {
    readonly schemaVersion: number;
    readonly language: AppLanguage;
    readonly plugins: readonly ConnectorConfiguration[];
    readonly launchAtLogin: boolean;
    readonly proxy?: ProxyConfiguration;
    readonly accentColor?: string;
    readonly theme?: "light" | "dark" | "system";
    readonly logLevel?: LogLevel;
    readonly pinToTop?: boolean;
    readonly minimizeToTray?: boolean;
    readonly globalRefreshIntervalSeconds?: number;
    readonly pauseAutoRefresh?: boolean;
    readonly providerOrder?: readonly string[];
    readonly accountOrders?: Readonly<Record<string, readonly string[]>>;
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
    /** When true, hide account remarks/display names in UI surfaces. */
    readonly uiDesensitizeRemarks?: boolean;
    /** Per-provider: force all metrics to percent display (not ratio). */
    readonly providerForcePercent?: Readonly<Partial<Record<UsageProvider, boolean>>>;
    readonly settingsBounds?: FloatingBoundsConfiguration;
    readonly floatingBounds?: FloatingBoundsConfiguration;
    readonly accountOverrides?: AccountOverrides;
    readonly accountLabels?: AccountLabels;
    readonly collapsedAccounts?: Readonly<Record<string, boolean>>;
    readonly expandedProviders?: Readonly<Record<string, boolean>>;
    readonly convergentTimeMinutes?: number;
    /** Directories grouped under one project label in the agent panel. */
    readonly dirAliases?: readonly {
        readonly alias: string;
        readonly dirs: readonly string[];
    }[];
    /** Models grouped under one label in the agent panel. */
    readonly modelAliases?: readonly {
        readonly alias: string;
        readonly models: readonly string[];
    }[];
    /**
     * Manifest ids of built-in connectors the user has deleted. Auto-seed skips
     * these on startup so deleted accounts don't resurrect (t038). Optional:
     * absent on older configs = nothing tombstoned.
     */
    readonly removedConnectorIds?: readonly string[];
    readonly tokenStats?: {
        readonly pollIntervalMinutes?: number;
        readonly wslEnabled?: boolean;
        readonly wslDistro?: string;
        readonly wslUser?: string;
    };
    /** t041: 剩余时间占周期百分比 ≤ 此值时进「即将重置」面板；null/undefined 不展示面板。 */
    readonly upcomingResetThresholdPercent?: number | null;
}

export interface ConnectorConfiguration {
    readonly instanceId: string;
    readonly stateId: string;
    readonly name: string;
    readonly displayName?: string;
    readonly enabled: boolean;
    readonly executablePath: string;
    readonly refreshIntervalSeconds: number;
    readonly manualRefreshOnly?: boolean;
    readonly parameterValues: Readonly<Record<string, string | number>>;
    readonly endpointOverrides: Readonly<Record<string, string>>;
}

/** @deprecated Use ConnectorConfiguration */
export type PluginConfiguration = ConnectorConfiguration;

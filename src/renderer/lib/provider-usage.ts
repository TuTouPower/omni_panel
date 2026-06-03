import type { UsageItem, UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
import type { ConnectorInfo } from "../../shared/types/ipc";

export interface ProviderUsageWindow {
    id: string;
    provider: UsageProvider;
    source: UsageSource;
    sourceInstanceId: string;
    connectorInstanceId: string;
    connectorDisplayName: string;
    accountId: string;
    accountLabel: string;
    name: string;
    used: number;
    limit: number;
    displayStyle: UsageItem["displayStyle"];
    resetAt?: string | null | undefined;
    status: UsageItem["status"];
    color?: UsageItem["color"] | undefined;
    updatedAt: string;
}

export interface ProviderUsageAccount {
    id: string;
    sourceInstanceId: string;
    accountId: string;
    accountLabel: string;
    status: UsageItem["status"];
    updatedAt: string;
    windows: ProviderUsageWindow[];
}

export interface ProviderUsageGroup {
    provider: UsageProvider;
    label: string;
    accountCount: number;
    status: UsageItem["status"];
    updatedAt: string;
    windows: ProviderUsageWindow[];
    accounts: ProviderUsageAccount[];
}

export const PROVIDER_ORDER: readonly UsageProvider[] = [
    "claude",
    "codex",
    "gemini",
    "antigravity",
    "kimi",
    "glm",
    "minimax",
    "deepseek",
    "tavily",
];

export const PROVIDER_LABELS: Record<UsageProvider, string> = {
    claude: "Claude",
    codex: "Codex",
    gemini: "Gemini",
    antigravity: "Antigravity",
    kimi: "Kimi",
    glm: "GLM",
    minimax: "MiniMax",
    deepseek: "DeepSeek",
    tavily: "Tavily",
};

const STATUS_RANK: Record<UsageItem["status"], number> = {
    normal: 0,
    unknown: 1,
    warning: 2,
    critical: 3,
};

function compareProviders(a: UsageProvider, b: UsageProvider): number {
    return PROVIDER_ORDER.indexOf(a) - PROVIDER_ORDER.indexOf(b);
}

function latestTimestamp(a: string, b: string): string {
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function worstStatus(a: UsageItem["status"], b: UsageItem["status"]): UsageItem["status"] {
    return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function toWindow(
    item: UsageItem,
    connector: ConnectorInfo,
    updatedAt: string,
): ProviderUsageWindow {
    return {
        id: item.id,
        provider: item.provider,
        source: item.source,
        sourceInstanceId: item.sourceInstanceId,
        connectorInstanceId: connector.instanceId,
        connectorDisplayName: connector.displayName,
        accountId: item.accountId,
        accountLabel: item.accountLabel,
        name: item.name,
        used: item.used,
        limit: item.limit,
        displayStyle: item.displayStyle,
        resetAt: item.resetAt,
        status: item.status,
        color: item.color,
        updatedAt,
    };
}

export function buildProviderUsageGroups(
    connectors: readonly ConnectorInfo[],
): ProviderUsageGroup[] {
    const windowsByProvider = new Map<UsageProvider, ProviderUsageWindow[]>();

    for (const connector of connectors) {
        if (!connector.enabled) continue;
        if (connector.snapshot.status !== "ready") continue;

        for (const item of connector.snapshot.items) {
            const windows = windowsByProvider.get(item.provider) ?? [];
            windows.push(toWindow(item, connector, connector.snapshot.updatedAt));
            windowsByProvider.set(item.provider, windows);
        }
    }

    return [...windowsByProvider.entries()]
        .sort(([a], [b]) => compareProviders(a, b))
        .map(([provider, windows]) => {
            const accountsByKey = new Map<string, ProviderUsageAccount>();
            let groupStatus: UsageItem["status"] = "normal";
            let groupUpdatedAt = windows[0]?.updatedAt ?? "";

            for (const window of windows) {
                const accountKey = `${window.sourceInstanceId}:${window.accountId}`;
                const account = accountsByKey.get(accountKey);
                groupStatus = worstStatus(groupStatus, window.status);
                groupUpdatedAt = latestTimestamp(groupUpdatedAt, window.updatedAt);

                if (account) {
                    account.windows.push(window);
                    account.status = worstStatus(account.status, window.status);
                    account.updatedAt = latestTimestamp(account.updatedAt, window.updatedAt);
                    continue;
                }

                accountsByKey.set(accountKey, {
                    id: accountKey,
                    sourceInstanceId: window.sourceInstanceId,
                    accountId: window.accountId,
                    accountLabel: window.accountLabel,
                    status: window.status,
                    updatedAt: window.updatedAt,
                    windows: [window],
                });
            }

            return {
                provider,
                label: PROVIDER_LABELS[provider],
                accountCount: accountsByKey.size,
                status: groupStatus,
                updatedAt: groupUpdatedAt,
                windows,
                accounts: [...accountsByKey.values()],
            };
        });
}

export function getVisibleProviders(connectors: readonly ConnectorInfo[]): UsageProvider[] {
    const providers = new Set<UsageProvider>();

    for (const group of buildProviderUsageGroups(connectors)) {
        providers.add(group.provider);
    }

    for (const connector of connectors) {
        if (!connector.enabled) continue;

        for (const provider of connector.activeProviders) {
            providers.add(provider);
        }
    }

    return [...providers].sort(compareProviders);
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

export function resolveConvergentTime(timestamps: (string | null | undefined)[]): string | null {
    const valid = timestamps
        .map((t) => (t ? { raw: t, time: new Date(t).getTime() } : null))
        .filter((t): t is { raw: string; time: number } => t !== null && Number.isFinite(t.time));
    const [first] = valid;
    if (!first) return null;
    if (valid.length === 1) return first.raw;

    const earliest = valid.reduce((min, item) => Math.min(min, item.time), first.time);
    const latest = valid.reduce((max, item) => Math.max(max, item.time), first.time);

    if (latest - earliest > TEN_MINUTES_MS) return null;

    return valid.find((t) => t.time === latest)?.raw ?? null;
}

function hasValidQuota(window: ProviderUsageWindow): boolean {
    return (
        Number.isFinite(window.used) &&
        Number.isFinite(window.limit) &&
        window.used >= 0 &&
        window.limit > 0
    );
}

export interface OverviewWindow {
    id: string;
    name: string;
    percent: number;
    used: number;
    limit: number;
    displayStyle: UsageItem["displayStyle"];
    status: UsageItem["status"];
    updatedAt: string | null;
    resetAt: string | null;
    color?: UsageItem["color"];
}

export function buildOverviewForGroup(group: ProviderUsageGroup): OverviewWindow[] {
    const byPeriod = new Map<string, ProviderUsageWindow[]>();

    for (const window of group.windows) {
        const existing = byPeriod.get(window.name) ?? [];
        existing.push(window);
        byPeriod.set(window.name, existing);
    }

    const result: OverviewWindow[] = [];

    for (const [name, windows] of byPeriod) {
        const validWindows = windows.filter(hasValidQuota);
        if (validWindows.length === 0) continue;

        const totalUsed = validWindows.reduce((sum, window) => sum + window.used, 0);
        const totalLimit = validWindows.reduce((sum, window) => sum + window.limit, 0);
        const percent = Math.round((totalUsed / totalLimit) * 100);
        const periodWorstStatus = validWindows.reduce<UsageItem["status"]>(
            (worst, window) => worstStatus(window.status, worst),
            "normal",
        );

        result.push({
            id: `overview-${name}`,
            name,
            percent: Math.min(100, Math.max(0, percent)),
            used: totalUsed,
            limit: totalLimit,
            displayStyle: validWindows[0]?.displayStyle ?? "percent",
            status: periodWorstStatus,
            updatedAt: resolveConvergentTime(validWindows.map((window) => window.updatedAt)),
            resetAt: resolveConvergentTime(validWindows.map((window) => window.resetAt)),
            color: validWindows.find((window) => window.color)?.color,
        });
    }

    return result;
}

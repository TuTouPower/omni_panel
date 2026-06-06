import { createLogger } from "../../shared/lib/logger";
import type { UsageItem, UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
import type { AccountOverrides } from "../../shared/types/config";
import type { ConnectorInfo } from "../../shared/types/ipc";

export interface ProviderUsagePeriod {
    id: string;
    provider: UsageProvider;
    source: UsageSource;
    sourceInstanceId: string;
    connectorInstanceId: string;
    connectorDisplayName: string;
    accountId: string;
    accountLabel: string;
    name: string;
    used: number | null;
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
    periods: ProviderUsagePeriod[];
}

export interface ProviderUsageGroup {
    provider: UsageProvider;
    label: string;
    accountCount: number;
    status: UsageItem["status"];
    updatedAt: string;
    periods: ProviderUsagePeriod[];
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

const log = createLogger("renderer:provider-usage");
const should_log_raw = import.meta.env.DEV;

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

function toPeriod(
    item: UsageItem,
    connector: ConnectorInfo,
    updatedAt: string,
): ProviderUsagePeriod {
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

function accountKeyForPeriod(period: ProviderUsagePeriod): string {
    if (period.source === "cpa") {
        return `${period.sourceInstanceId}:label:${period.accountLabel}`;
    }
    return `${period.sourceInstanceId}:${period.accountId}`;
}

export function format_usage_period_label(name: string): string {
    if (name.includes("5小时") || name.includes("5 小时")) return "5小时";
    if (name.includes("一周") || name.includes("每周") || /weekly|week/i.test(name)) return "一周";
    if (/\bMCP\b/i.test(name)) return "MCP";

    const after_separator = name.split("·").pop()?.trim();
    return after_separator && after_separator.length > 0 ? after_separator : name;
}

export function build_provider_usage_groups(
    connectors: readonly ConnectorInfo[],
): ProviderUsageGroup[] {
    if (should_log_raw) {
        log.debug("provider usage input raw", { snapshots: connectors });
    }
    const periodsByProvider = new Map<UsageProvider, ProviderUsagePeriod[]>();

    for (const connector of connectors) {
        if (!connector.enabled) continue;
        const snapshot = connector.snapshot;
        if (!("items" in snapshot)) continue;
        if (!("updatedAt" in snapshot)) continue;

        for (const item of snapshot.items) {
            const periods = periodsByProvider.get(item.provider) ?? [];
            periods.push(toPeriod(item, connector, snapshot.updatedAt));
            periodsByProvider.set(item.provider, periods);
        }
    }

    const groups = [...periodsByProvider.entries()]
        .sort(([a], [b]) => compareProviders(a, b))
        .map(([provider, periods]) => {
            const accountsByKey = new Map<string, ProviderUsageAccount>();
            let groupStatus: UsageItem["status"] = "normal";
            let groupUpdatedAt = periods[0]?.updatedAt ?? "";

            for (const period of periods) {
                const accountKey = accountKeyForPeriod(period);
                const account = accountsByKey.get(accountKey);
                groupStatus = worstStatus(groupStatus, period.status);
                groupUpdatedAt = latestTimestamp(groupUpdatedAt, period.updatedAt);

                if (account) {
                    account.periods.push(period);
                    account.status = worstStatus(account.status, period.status);
                    account.updatedAt = latestTimestamp(account.updatedAt, period.updatedAt);
                    continue;
                }

                accountsByKey.set(accountKey, {
                    id: accountKey,
                    sourceInstanceId: period.sourceInstanceId,
                    accountId: period.accountId,
                    accountLabel: period.accountLabel,
                    status: period.status,
                    updatedAt: period.updatedAt,
                    periods: [period],
                });
            }

            return {
                provider,
                label: PROVIDER_LABELS[provider],
                accountCount: accountsByKey.size,
                status: groupStatus,
                updatedAt: groupUpdatedAt,
                periods,
                accounts: [...accountsByKey.values()],
            };
        });
    if (should_log_raw) {
        log.debug("provider usage grouped raw", { groups });
    }
    return groups;
}

export function apply_account_overrides(
    groups: ProviderUsageGroup[],
    overrides: AccountOverrides | undefined,
): ProviderUsageGroup[] {
    if (!overrides) return groups;
    return groups
        .map((group) => {
            const excluded_set = new Set([
                ...(overrides.hidden?.[group.provider] ?? []),
                ...(overrides.disabled?.[group.provider] ?? []),
            ]);
            if (excluded_set.size === 0) return group;

            const filtered = group.accounts.filter((a) => !excluded_set.has(a.id));
            const filtered_periods = group.periods.filter(
                (p) => !excluded_set.has(accountKeyForPeriod(p)),
            );
            return {
                ...group,
                accounts: filtered,
                periods: filtered_periods,
                accountCount: filtered.length,
            };
        })
        .filter((group) => group.accounts.length > 0);
}

export function get_visible_providers(connectors: readonly ConnectorInfo[]): UsageProvider[] {
    const providers = new Set<UsageProvider>();

    for (const group of build_provider_usage_groups(connectors)) {
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

export function resolve_convergent_time(timestamps: (string | null | undefined)[]): string | null {
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

function hasValidQuota(period: ProviderUsagePeriod): boolean {
    return (
        period.used !== null &&
        Number.isFinite(period.used) &&
        Number.isFinite(period.limit) &&
        period.used >= 0 &&
        period.limit > 0
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

export function build_overview_for_group(group: ProviderUsageGroup): OverviewWindow[] {
    const byPeriod = new Map<string, ProviderUsagePeriod[]>();

    for (const period of group.periods) {
        const label = format_usage_period_label(period.name);
        const existing = byPeriod.get(label) ?? [];
        existing.push(period);
        byPeriod.set(label, existing);
    }

    const result: OverviewWindow[] = [];

    for (const [name, periods] of byPeriod) {
        const validPeriods = periods.filter(hasValidQuota);
        if (validPeriods.length === 0) continue;

        const totalUsed = validPeriods.reduce((sum, period) => sum + (period.used ?? 0), 0);
        const totalLimit = validPeriods.reduce((sum, period) => sum + period.limit, 0);
        const percent = Math.round((totalUsed / totalLimit) * 100);
        const periodWorstStatus = validPeriods.reduce<UsageItem["status"]>(
            (worst, period) => worstStatus(period.status, worst),
            "normal",
        );

        result.push({
            id: `overview-${name}`,
            name,
            percent: Math.min(100, Math.max(0, percent)),
            used: totalUsed,
            limit: totalLimit,
            displayStyle: validPeriods[0]?.displayStyle ?? "percent",
            status: periodWorstStatus,
            updatedAt: resolve_convergent_time(validPeriods.map((period) => period.updatedAt)),
            resetAt: resolve_convergent_time(validPeriods.map((period) => period.resetAt)),
            color: validPeriods.find((period) => period.color)?.color,
        });
    }

    if (should_log_raw) {
        log.debug("provider overview periods raw", {
            provider: group.provider,
            overviewPeriods: result,
        });
    }
    return result;
}

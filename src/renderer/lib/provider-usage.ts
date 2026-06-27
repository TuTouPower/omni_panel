import { createLogger } from "../../shared/lib/logger";
import type { MetricRecord, UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
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
    raw_label: string;
    name: string;
    display_label?: string | undefined;
    used: number | null;
    limit: number | null;
    displayStyle: MetricRecord["displayStyle"];
    resetAt: number | null;
    status: MetricRecord["status"];
    color?: MetricRecord["color"] | undefined;
    updatedAt: string;
    observedAt: number;
    stale: boolean;
}

export interface ProviderUsageAccount {
    id: string;
    sourceInstanceId: string;
    accountId: string;
    accountLabel: string;
    status: MetricRecord["status"];
    updatedAt: string;
    observedAt: number;
    stale: boolean;
    periods: ProviderUsagePeriod[];
}

export interface ProviderUsageGroup {
    provider: UsageProvider;
    label: string;
    accountCount: number;
    status: MetricRecord["status"];
    updatedAt: string;
    observedAt: number;
    source?: UsageSource | "mixed" | undefined;
    stale: boolean;
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
    "mimo",
    "opencode_go",
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
    mimo: "MiMo",
    opencode_go: "OpenCode Go",
};

const log = createLogger("renderer:provider-usage");
const should_log_raw = import.meta.env.DEV;

const STATUS_RANK: Record<MetricRecord["status"], number> = {
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

function latestEpoch(a: number, b: number): number {
    return Math.max(a, b);
}

function worstStatus(a: MetricRecord["status"], b: MetricRecord["status"]): MetricRecord["status"] {
    return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function toPeriod(
    item: MetricRecord,
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
        name: item.normalized_label,
        raw_label: item.raw_label,
        display_label: item.display_label,
        used: item.used,
        limit: item.limit,
        displayStyle: item.displayStyle,
        resetAt: item.resetAt,
        status: item.status,
        color: item.color,
        updatedAt,
        observedAt: item.observedAt,
        stale: item.stale,
    };
}

function accountKeyForPeriod(period: ProviderUsagePeriod): string {
    if (period.source === "gateway") {
        return `${period.sourceInstanceId}|label|${period.accountLabel}`;
    }
    return `${period.sourceInstanceId}|${period.accountId}`;
}

const LABEL_MAP: Record<string, string> = {
    "gemini-3.1-flash-lite-preview": "3.1 Flash-Lite·Pv",
    "gemini-2.5-flash-lite-preview": "2.5 Flash-Lite·Pv",
    "gemini-2.5-pro-preview": "2.5 Pro·Pv",
    "gemini-2.5-flash-preview": "2.5 Flash·Pv",
};

export function format_usage_period_label(
    raw_label: string,
    name: string,
    overrides?: Readonly<Record<string, string>>,
): string {
    const custom = overrides?.[raw_label];
    if (custom) return custom;

    const normalized = name.trim();
    const mapped = LABEL_MAP[normalized];
    if (mapped) return mapped;

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
            let groupStatus: MetricRecord["status"] = "normal";
            let groupUpdatedAt = periods[0]?.updatedAt ?? "";
            let groupObservedAt = periods[0]?.observedAt ?? 0;
            let groupStale = false;

            for (const period of periods) {
                const accountKey = accountKeyForPeriod(period);
                const account = accountsByKey.get(accountKey);
                groupStatus = worstStatus(groupStatus, period.status);
                groupUpdatedAt = latestTimestamp(groupUpdatedAt, period.updatedAt);
                groupObservedAt = latestEpoch(groupObservedAt, period.observedAt);
                groupStale = groupStale || period.stale;

                if (account) {
                    account.periods.push(period);
                    account.status = worstStatus(account.status, period.status);
                    account.updatedAt = latestTimestamp(account.updatedAt, period.updatedAt);
                    account.observedAt = latestEpoch(account.observedAt, period.observedAt);
                    account.stale = account.stale || period.stale;
                    continue;
                }

                accountsByKey.set(accountKey, {
                    id: accountKey,
                    sourceInstanceId: period.sourceInstanceId,
                    accountId: period.accountId,
                    accountLabel: period.accountLabel,
                    status: period.status,
                    updatedAt: period.updatedAt,
                    observedAt: period.observedAt,
                    stale: period.stale,
                    periods: [period],
                });
            }

            const sources = new Set(periods.map((period) => period.source));
            const groupSource: ProviderUsageGroup["source"] =
                sources.size === 1 ? (periods[0]?.source ?? "poll") : "mixed";

            return {
                provider,
                label: PROVIDER_LABELS[provider],
                accountCount: accountsByKey.size,
                status: groupStatus,
                updatedAt: groupUpdatedAt,
                observedAt: groupObservedAt,
                source: groupSource,
                stale: groupStale,
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

export function resolve_convergent_time(
    timestamps: (string | null | undefined)[],
    thresholdMs?: number,
): string | null {
    const valid = timestamps
        .map((t) => (t ? { raw: t, time: new Date(t).getTime() } : null))
        .filter((t): t is { raw: string; time: number } => t !== null && Number.isFinite(t.time));
    const [first] = valid;
    if (!first) return null;
    if (valid.length === 1) return first.raw;

    const earliest = valid.reduce((min, item) => Math.min(min, item.time), first.time);
    const latest = valid.reduce((max, item) => Math.max(max, item.time), first.time);

    if (latest - earliest > (thresholdMs ?? TEN_MINUTES_MS)) return null;

    return valid.find((t) => t.time === latest)?.raw ?? null;
}

export function resolve_convergent_epoch(
    epochs: (number | null)[],
    thresholdMs?: number,
): number | null {
    const valid = epochs.filter((t): t is number => t !== null);
    if (valid.length === 0) return null;
    const first = valid[0];
    if (first === undefined) return null;
    const rest = valid.slice(1);
    if (rest.length === 0) return first;

    const earliest = rest.reduce((min, item) => Math.min(min, item), first);
    const latest = rest.reduce((max, item) => Math.max(max, item), first);

    if (latest - earliest > (thresholdMs ?? TEN_MINUTES_MS)) return null;

    return latest;
}

function hasValidQuota(period: ProviderUsagePeriod): boolean {
    return (
        period.used !== null &&
        Number.isFinite(period.used) &&
        period.limit !== null &&
        Number.isFinite(period.limit) &&
        period.used >= 0 &&
        period.limit > 0
    );
}

export interface OverviewWindow {
    id: string;
    name: string;
    raw_label: string;
    percent: number;
    used: number;
    limit: number | null;
    displayStyle: MetricRecord["displayStyle"];
    status: MetricRecord["status"];
    updatedAt: string | null;
    resetAt: number | null;
    color?: MetricRecord["color"];
}

export function build_overview_for_group(
    group: ProviderUsageGroup,
    convergentTimeMinutes?: number,
    labelMap?: Readonly<Record<string, string>>,
    labelMapForPeriod?: (
        period: ProviderUsagePeriod,
    ) => Readonly<Record<string, string>> | undefined,
): OverviewWindow[] {
    const byPeriod = new Map<string, ProviderUsagePeriod[]>();

    for (const period of group.periods) {
        const label = format_usage_period_label(
            period.raw_label,
            period.name,
            labelMapForPeriod?.(period) ?? labelMap,
        );
        const existing = byPeriod.get(label) ?? [];
        existing.push(period);
        byPeriod.set(label, existing);
    }

    const result: OverviewWindow[] = [];

    for (const [name, periods] of byPeriod) {
        const validPeriods = periods.filter(hasValidQuota);
        if (validPeriods.length === 0) continue;

        const totalUsed = validPeriods.reduce((sum, period) => sum + (period.used ?? 0), 0);
        const totalLimit = validPeriods.reduce((sum, period) => sum + (period.limit ?? 0), 0);
        const percent = Math.round((totalUsed / totalLimit) * 100);
        const periodWorstStatus = validPeriods.reduce<MetricRecord["status"]>(
            (worst, period) => worstStatus(period.status, worst),
            "normal",
        );

        result.push({
            id: `overview-${name}`,
            name,
            raw_label: validPeriods[0]?.raw_label ?? name,
            percent: Math.min(100, Math.max(0, percent)),
            used: totalUsed,
            limit: totalLimit,
            displayStyle: validPeriods[0]?.displayStyle ?? "percent",
            status: periodWorstStatus,
            updatedAt: resolve_convergent_time(
                validPeriods.map((period) => period.updatedAt),
                convergentTimeMinutes !== undefined ? convergentTimeMinutes * 60 * 1000 : undefined,
            ),
            resetAt: resolve_convergent_epoch(
                validPeriods.map((period) => period.resetAt),
                convergentTimeMinutes !== undefined ? convergentTimeMinutes * 60 * 1000 : undefined,
            ),
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

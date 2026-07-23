import { createLogger } from "../../shared/lib/logger";
import type { MetricRecord, UsageProvider, UsageSource } from "../../shared/schemas/plugin-output";
import type { AccountLabels, AccountOverrides } from "../../shared/types/config";
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
    cycleDurationMs?: number | null | undefined;
    status: MetricRecord["status"];
    color?: MetricRecord["color"] | undefined;
    updatedAt: string;
    observedAt: number;
    stale: boolean;
    error?: string | undefined;
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
    /** t040：失败占位账号的错误文案（periods 为空时由它驱动 error badge）。 */
    error?: string;
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
    "antigravity",
    "kimi",
    "glm",
    "minimax",
    "deepseek",
    "tavily",
    "firecrawl",
    "exa",
    "mimo",
    "opencode_go",
    "grok",
];

export const PROVIDER_LABELS: Record<UsageProvider, string> = {
    claude: "Claude",
    codex: "Codex",
    antigravity: "Antigravity",
    kimi: "Kimi",
    glm: "GLM",
    minimax: "MiniMax",
    deepseek: "DeepSeek",
    tavily: "Tavily",
    firecrawl: "Firecrawl",
    exa: "Exa",
    mimo: "MiMo",
    opencode_go: "OpenCode Go",
    grok: "Grok",
};

const log = createLogger("renderer:provider-usage");
const should_log_raw = import.meta.env.DEV;

const STATUS_RANK: Record<MetricRecord["status"], number> = {
    normal: 0,
    unknown: 1,
    warning: 2,
    critical: 3,
};

function compare_providers(a: UsageProvider, b: UsageProvider): number {
    return PROVIDER_ORDER.indexOf(a) - PROVIDER_ORDER.indexOf(b);
}

function latest_timestamp(a: string, b: string): string {
    return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
}

function latestEpoch(a: number, b: number): number {
    return Math.max(a, b);
}

function worst_status(
    a: MetricRecord["status"],
    b: MetricRecord["status"],
): MetricRecord["status"] {
    return STATUS_RANK[a] >= STATUS_RANK[b] ? a : b;
}

function to_period(
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
        // 直连账号备注（ConnectorConfiguration.displayName）覆盖采集层默认名。
        // CPA displayName 属于数据源备注，不能覆盖其子账号标签。
        accountLabel:
            item.source !== "gateway" &&
            connector.displayName &&
            connector.displayName !== connector.name
                ? connector.displayName
                : item.accountLabel,
        name: item.normalized_label,
        raw_label: item.raw_label,
        display_label: item.display_label,
        used: item.used,
        limit: item.limit,
        displayStyle: item.displayStyle,
        resetAt: item.resetAt,
        cycleDurationMs: item.cycleDurationMs,
        status: item.status,
        color: item.color,
        updatedAt,
        observedAt: item.observedAt,
        stale: item.stale,
        error: item.error,
    };
}

/**
 * The identity contract for a 账号 (account) — how a single account is told
 * apart across periods/connectors. Gateway-source accounts key by label
 * (the gateway may not expose a stable id); everything else keys by
 * sourceInstanceId|accountId. Exported so override/hide/reorder callers use
 * the canonical rule instead of re-deriving it.
 */
export interface AccountKeyInput {
    source: UsageSource;
    sourceInstanceId: string;
    accountId: string;
    accountLabel: string;
}

export function accountKey(item: AccountKeyInput): string {
    if (item.source === "gateway") {
        return `${item.sourceInstanceId}|label|${item.accountLabel}`;
    }
    return `${item.sourceInstanceId}|${item.accountId}`;
}

export function format_usage_period_label(
    raw_label: string,
    name: string,
    overrides?: Readonly<Record<string, string>>,
): string {
    const custom = overrides?.[raw_label];
    if (custom) return custom;
    return name;
}

export function build_provider_usage_groups(
    connectors: readonly ConnectorInfo[],
): ProviderUsageGroup[] {
    if (should_log_raw) {
        log.debug("provider usage input raw", { snapshots: connectors });
    }
    const periodsByProvider = new Map<UsageProvider, ProviderUsagePeriod[]>();
    // t040：enabled 直连 connector failed 且无 items 时合成失败账号占位，
    // 供 ProviderAccountList 渲染失败行（首次采集失败无 observation，否则
    // 该账号从主面板消失）。CPA（gateway）多账号不合成。
    const failedPlaceholdersByProvider = new Map<UsageProvider, ProviderUsageAccount[]>();

    for (const connector of connectors) {
        if (!connector.enabled) continue;
        const snapshot = connector.snapshot;
        const items = "items" in snapshot ? snapshot.items : [];
        const has_items = items.length > 0;
        if (has_items && "updatedAt" in snapshot) {
            for (const item of items) {
                const periods = periodsByProvider.get(item.provider) ?? [];
                periods.push(to_period(item, connector, snapshot.updatedAt));
                periodsByProvider.set(item.provider, periods);
            }
            continue;
        }
        // t040：零 items（!has_items）且直连（非 gateway）failed connector 合成占位。
        // 严格对齐 spec：items.length===0 才合成，避免 failed+有 items 但缺 updatedAt
        // 的边缘形态误落合成。
        if (
            !has_items &&
            snapshot.status === "failed" &&
            connector.source !== "gateway" &&
            connector.activeProviders.length > 0
        ) {
            const provider = connector.activeProviders[0];
            if (provider === undefined) continue;
            const label = connector.displayName || connector.name;
            const placeholder: ProviderUsageAccount = {
                id: `${connector.sourceInstanceId}|__failed__`,
                sourceInstanceId: connector.sourceInstanceId,
                accountId: "__failed__",
                accountLabel: label,
                status: "unknown",
                updatedAt: "updatedAt" in snapshot ? snapshot.updatedAt : "",
                observedAt: 0,
                stale: false,
                periods: [],
                error: snapshot.error,
            };
            const list = failedPlaceholdersByProvider.get(provider) ?? [];
            list.push(placeholder);
            failedPlaceholdersByProvider.set(provider, list);
        }
    }

    const allProviders = new Set<UsageProvider>([
        ...periodsByProvider.keys(),
        ...failedPlaceholdersByProvider.keys(),
    ]);

    const groups = [...allProviders]
        .sort((a, b) => compare_providers(a, b))
        .map((provider) => {
            const periods = periodsByProvider.get(provider) ?? [];
            const accountsByKey = new Map<string, ProviderUsageAccount>();
            let groupStatus: MetricRecord["status"] = "normal";
            let groupUpdatedAt = periods[0]?.updatedAt ?? "";
            let groupObservedAt = periods[0]?.observedAt ?? 0;
            let groupStale = false;

            for (const period of periods) {
                const key = accountKey(period);
                const account = accountsByKey.get(key);
                groupStatus = worst_status(groupStatus, period.status);
                groupUpdatedAt = latest_timestamp(groupUpdatedAt, period.updatedAt);
                groupObservedAt = latestEpoch(groupObservedAt, period.observedAt);
                groupStale = groupStale || period.stale;

                if (account) {
                    account.periods.push(period);
                    account.status = worst_status(account.status, period.status);
                    account.updatedAt = latest_timestamp(account.updatedAt, period.updatedAt);
                    account.observedAt = latestEpoch(account.observedAt, period.observedAt);
                    account.stale = account.stale || period.stale;
                    continue;
                }

                accountsByKey.set(key, {
                    id: key,
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

            // t040：并入失败占位账号（不覆盖真实账号）
            for (const account of failedPlaceholdersByProvider.get(provider) ?? []) {
                if (!accountsByKey.has(account.id)) {
                    accountsByKey.set(account.id, account);
                    groupStatus = worst_status(groupStatus, account.status);
                }
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
            const excluded_set = new Set([...(overrides.hidden?.[group.provider] ?? [])]);
            if (excluded_set.size === 0) return group;

            const filtered = group.accounts.filter((a) => !excluded_set.has(a.id));
            const filtered_periods = group.periods.filter((p) => !excluded_set.has(accountKey(p)));
            return {
                ...group,
                accounts: filtered,
                periods: filtered_periods,
                accountCount: filtered.length,
            };
        })
        .filter((group) => group.accounts.length > 0);
}

export function apply_account_labels(
    groups: ProviderUsageGroup[],
    labels: AccountLabels | undefined,
): ProviderUsageGroup[] {
    if (!labels) return groups;
    return groups.map((group) => {
        const label_map = labels[group.provider];
        if (!label_map) return group;
        return {
            ...group,
            accounts: group.accounts.map((account) => {
                const custom = label_map[account.accountId];
                if (custom === undefined || custom === account.accountLabel) return account;
                return { ...account, accountLabel: custom };
            }),
        };
    });
}

export interface AccountError {
    provider: UsageProvider;
    accountLabel: string;
    error: string;
}

/**
 * Scan all accounts across provider groups for MetricRecord-level errors.
 * For each account that has at least one period with `error` set, the first
 * error message is captured. Returns a Map keyed by account id (= the
 * canonical account key used by ProviderAccountRow).
 */
export function buildAccountErrors(
    groups: readonly ProviderUsageGroup[],
): Map<string, AccountError> {
    const result = new Map<string, AccountError>();
    for (const group of groups) {
        for (const account of group.accounts) {
            // t040：失败占位账号（periods 空 + account.error）直接记录
            if (account.error) {
                result.set(account.id, {
                    provider: group.provider,
                    accountLabel: account.accountLabel,
                    error: account.error,
                });
                continue;
            }
            for (const period of account.periods) {
                if (period.error) {
                    result.set(account.id, {
                        provider: group.provider,
                        accountLabel: account.accountLabel,
                        error: period.error,
                    });
                    break; // first error per account is sufficient
                }
            }
        }
    }
    return result;
}

export function visible_providers_from_groups(
    groups: readonly ProviderUsageGroup[],
    connectors: readonly ConnectorInfo[],
): UsageProvider[] {
    const providers = new Set<UsageProvider>(groups.map((g) => g.provider));
    for (const connector of connectors) {
        if (!connector.enabled) continue;
        for (const provider of connector.activeProviders) {
            providers.add(provider);
        }
    }
    return [...providers].sort(compare_providers);
}

export function get_visible_providers(connectors: readonly ConnectorInfo[]): UsageProvider[] {
    return visible_providers_from_groups(build_provider_usage_groups(connectors), connectors);
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

function has_valid_quota(period: ProviderUsagePeriod): boolean {
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
        const validPeriods = periods.filter(has_valid_quota);
        if (validPeriods.length === 0) continue;

        const totalUsed = validPeriods.reduce((sum, period) => sum + (period.used ?? 0), 0);
        const totalLimit = validPeriods.reduce((sum, period) => sum + (period.limit ?? 0), 0);
        const percent = Math.round((totalUsed / totalLimit) * 100);
        const periodWorstStatus = validPeriods.reduce<MetricRecord["status"]>(
            (worst, period) => worst_status(period.status, worst),
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

export interface UpcomingResetItem {
    provider: UsageProvider;
    accountLabel: string;
    accountId: string;
    rawLabel: string;
    metricLabel: string;
    resetAt: number;
    percent: number;
    status: MetricRecord["status"];
}

/**
 * Collect accounts whose reset is "upcoming" — remaining time within the cycle
 * has dropped to ≤ thresholdPercent of the full cycle. `thresholdPercent` null
 * /undefined → feature off, returns []. t043: a period only enters if its
 * (provider, accountKey, raw_label) is explicitly listed in `watchedMetrics`
 * (default absent → all off). Periods lacking `cycleDurationMs`
 * (null/0/missing) or `resetAt` (null/≤now) are skipped.
 */
export function collect_upcoming_resets(
    groups: readonly ProviderUsageGroup[],
    options?: {
        thresholdPercent?: number | null | undefined;
        watchedMetrics?: AccountOverrides["upcomingResetWatched"];
        now?: number;
    },
): UpcomingResetItem[] {
    const threshold = options?.thresholdPercent;
    if (threshold === null || threshold === undefined) return [];
    const now = options?.now ?? Date.now();
    const watched = options?.watchedMetrics;
    const items: UpcomingResetItem[] = [];
    for (const group of groups) {
        const provider_watched = watched?.[group.provider];
        for (const account of group.accounts) {
            const watched_labels = provider_watched?.[account.id];
            if (!watched_labels || watched_labels.length === 0) continue;
            const watched_set = new Set(watched_labels);
            for (const period of account.periods) {
                if (!watched_set.has(period.raw_label)) continue;
                if (period.resetAt === null) continue;
                if (period.resetAt <= now) continue;
                const cycle = period.cycleDurationMs;
                if (!cycle || cycle <= 0) continue;
                const remaining_pct = ((period.resetAt - now) / cycle) * 100;
                if (remaining_pct > threshold) continue;
                const used = period.used;
                const limit = period.limit;
                const percent =
                    used !== null &&
                    limit !== null &&
                    limit > 0 &&
                    Number.isFinite(used) &&
                    Number.isFinite(limit)
                        ? Math.min(100, Math.max(0, Math.round((used / limit) * 100)))
                        : 0;
                items.push({
                    provider: group.provider,
                    accountLabel: account.accountLabel,
                    accountId: account.accountId,
                    rawLabel: period.raw_label,
                    metricLabel: period.display_label ?? period.raw_label,
                    resetAt: period.resetAt,
                    percent,
                    status: period.status,
                });
            }
        }
    }
    items.sort((a, b) => a.resetAt - b.resetAt);
    return items;
}

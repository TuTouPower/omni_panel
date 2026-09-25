import { createLogger } from "../../shared/lib/logger";
import type { MetricRecord, UsageSource } from "../../shared/schemas/plugin-output";
import type { AccountLabels, AccountOverrides } from "../../shared/types/config";
import type { ConnectorInfo } from "../../shared/types/ipc";
import { PROVIDER_ORDER, PROVIDER_ORDER_MAP, PROVIDER_LABELS } from "./provider_registry";

export { PROVIDER_ORDER, PROVIDER_LABELS };

export interface ProviderUsagePeriod {
    id: string;
    /**
     * Observation metric_id 列原值，trend 查询键。与 raw_label（label-map 键）区别见
     * {@link MetricRecord.metric_id}。
     */
    metric_id: string;
    provider: string;
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
    provider: string;
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

const log = createLogger("renderer:provider-usage");
const should_log_raw = import.meta.env.DEV;

// A76: 远端字符串 64 字符上限与控制字符过滤
export function sanitize_remote_string(
    value: string | null | undefined,
    max_len = 64,
): string | undefined {
    if (typeof value !== "string") return undefined;
    const clean = value.replace(/[\x00-\x1F\x7F]/g, "").trim();
    return clean.length > max_len ? clean.slice(0, max_len) : clean;
}

const STATUS_RANK: Record<MetricRecord["status"], number> = {
    normal: 0,
    unknown: 1,
    warning: 2,
    critical: 3,
};

// A120: 使用 Map rank 进行 O(1) 比较，消除热路径 indexOf O(N) 遍历
export function compare_providers(a: string, b: string): number {
    if (a === b) return 0;
    const rankA = PROVIDER_ORDER_MAP.get(a) ?? Number.POSITIVE_INFINITY;
    const rankB = PROVIDER_ORDER_MAP.get(b) ?? Number.POSITIVE_INFINITY;
    if (rankA === rankB) return a.localeCompare(b);
    return rankA - rankB;
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
        // runtime ready-state 总由 observation_to_metric_record 填充 metric_id；
        // schema 可选仅为兼容 plugin 脚本直接输出路径（该路径不经 to_period）。
        metric_id: item.metric_id ?? item.id,
        provider: item.provider,
        source: item.source,
        sourceInstanceId: item.sourceInstanceId,
        connectorInstanceId: connector.instanceId,
        connectorDisplayName: connector.displayName,
        accountId: item.accountId,
        // 直连账号备注（ConnectorConfiguration.displayName）覆盖采集层默认名。
        // CPA displayName 属于数据源备注，不能覆盖其子账号标签。
        accountLabel:
            sanitize_remote_string(
                item.source !== "gateway" &&
                    connector.displayName &&
                    connector.displayName !== connector.name
                    ? connector.displayName
                    : item.accountLabel,
            ) ?? item.accountLabel,
        name: sanitize_remote_string(item.normalized_label) ?? item.normalized_label,
        raw_label: sanitize_remote_string(item.raw_label) ?? item.raw_label,
        display_label: sanitize_remote_string(item.display_label),
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
    source?: UsageSource | undefined;
    sourceInstanceId: string;
    accountId: string;
    accountLabel?: string | undefined;
}

// A106: 结构化 AccountKey 对象
export interface AccountKeyObject {
    readonly isGateway: boolean;
    readonly key: string;
    readonly sourceInstanceId: string;
    readonly accountId: string;
    readonly accountLabel?: string | undefined;
}

export function to_account_key_object(item: AccountKeyInput): AccountKeyObject {
    const isGateway = item.source === "gateway";
    const key = isGateway
        ? `${item.sourceInstanceId}|label|${item.accountLabel ?? ""}`
        : `${item.sourceInstanceId}|${item.accountId}`;
    return {
        isGateway,
        key,
        sourceInstanceId: item.sourceInstanceId,
        accountId: item.accountId,
        accountLabel: item.accountLabel,
    };
}

export function accountKey(item: AccountKeyInput): string {
    return to_account_key_object(item).key;
}

const ANTIGRAVITY_PERIOD_ORDER = [
    "gemini_five_hour",
    "gemini_weekly",
    "claude_five_hour",
    "claude_weekly",
] as const;

// A102: Grok weekly 判定单源提取，供各处共用
export function is_weekly_like(period: {
    raw_label?: string | null | undefined;
    name: string;
    display_label?: string | null | undefined;
}): boolean {
    const raw = (period.raw_label ?? "").toLowerCase();
    return (
        raw === "credits" ||
        raw === "credit" ||
        raw === "weekly" ||
        raw === "seven_day" ||
        raw === "7d" ||
        raw.includes("week") ||
        period.name.includes("一周") ||
        period.name.includes("周") ||
        period.display_label?.includes("一周") === true ||
        period.display_label?.includes("周") === true
    );
}

function usage_period_order(provider: string, period: ProviderUsagePeriod): number {
    if (provider === "antigravity") {
        const index = ANTIGRAVITY_PERIOD_ORDER.indexOf(
            period.raw_label as (typeof ANTIGRAVITY_PERIOD_ORDER)[number],
        );
        return index >= 0 ? index : ANTIGRAVITY_PERIOD_ORDER.length;
    }
    return provider === "grok" && is_weekly_like(period) ? 1 : 0;
}

function order_usage_periods(
    provider: string,
    periods: readonly ProviderUsagePeriod[],
): ProviderUsagePeriod[] {
    return periods
        .map((period, index) => ({ period, index }))
        .sort(
            (a, b) =>
                usage_period_order(provider, a.period) - usage_period_order(provider, b.period) ||
                a.index - b.index,
        )
        .map(({ period }) => period);
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

/** snapshot 携带的 items（ready 恒有；loading/failed 有 lastSuccess 时才有）。 */
function snapshot_items_of(snapshot: ConnectorInfo["snapshot"]): readonly MetricRecord[] {
    if (!("items" in snapshot) || !Array.isArray(snapshot.items)) return [];
    return snapshot.items.filter(is_metric_record);
}

/** 快照 items 来自外部（类型为 any）：仅当具备 MetricRecord 必需键时收窄（p220）。 */
function is_metric_record(value: unknown): value is MetricRecord {
    if (typeof value !== "object" || value === null) return false;
    const record = value as Record<string, unknown>;
    return (
        typeof record["provider"] === "string" &&
        typeof record["source"] === "string" &&
        typeof record["sourceInstanceId"] === "string" &&
        typeof record["accountId"] === "string" &&
        typeof record["raw_label"] === "string" &&
        typeof record["normalized_label"] === "string"
    );
}

export function build_provider_usage_groups(
    connectors: readonly ConnectorInfo[],
): ProviderUsageGroup[] {
    if (should_log_raw) {
        log.debug("provider usage input raw", { snapshots: connectors });
    }
    const periodsByProvider = new Map<string, ProviderUsagePeriod[]>();
    // t040：enabled 直连 connector failed 且无 items 时合成失败账号占位，
    // 供 ProviderAccountList 渲染失败行（首次采集失败无 observation，否则
    // 该账号从主面板消失）。CPA（gateway）多账号不合成。
    const failedPlaceholdersByProvider = new Map<string, ProviderUsageAccount[]>();

    for (const connector of connectors) {
        if (!connector.enabled) continue;
        const snapshot = connector.snapshot;
        const items = snapshot_items_of(snapshot);
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
            const now_ms = Date.now();
            const snapshot_updated_at =
                "updatedAt" in snapshot && typeof snapshot.updatedAt === "string"
                    ? snapshot.updatedAt
                    : "";
            const valid_snapshot_time = snapshot_updated_at
                ? new Date(snapshot_updated_at).getTime()
                : NaN;
            const effective_observed_at = Number.isFinite(valid_snapshot_time)
                ? valid_snapshot_time
                : now_ms;
            const effective_updated_at = snapshot_updated_at || new Date(now_ms).toISOString();
            const placeholder: ProviderUsageAccount = {
                id: `${connector.sourceInstanceId}|__failed__`,
                sourceInstanceId: connector.sourceInstanceId,
                accountId: "__failed__",
                accountLabel: label,
                status: "unknown",
                updatedAt: effective_updated_at,
                observedAt: effective_observed_at,
                stale: false,
                periods: [],
                error: snapshot.error,
            };
            const list = failedPlaceholdersByProvider.get(provider) ?? [];
            list.push(placeholder);
            failedPlaceholdersByProvider.set(provider, list);
        }
    }

    const allProviders = new Set<string>([
        ...periodsByProvider.keys(),
        ...failedPlaceholdersByProvider.keys(),
    ]);

    const groups = [...allProviders]
        .sort((a, b) => compare_providers(a, b))
        .map((provider) => {
            const periods = order_usage_periods(provider, periodsByProvider.get(provider) ?? []);
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
                label: PROVIDER_LABELS[provider] ?? provider,
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
    provider: string;
    /**
     * t158: source-side connector instance id. Required so the row-level re-login
     * button can route to the specific failing instance rather than collapsing by provider.
     */
    sourceInstanceId: string;
    /** t158: stable per-connector account id (mirrors `accountId` on `ProviderUsageAccount`). */
    accountId: string;
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
                    sourceInstanceId: account.sourceInstanceId,
                    accountId: account.accountId,
                    accountLabel: account.accountLabel,
                    error: account.error,
                });
                continue;
            }
            for (const period of account.periods) {
                if (period.error) {
                    result.set(account.id, {
                        provider: group.provider,
                        sourceInstanceId: account.sourceInstanceId,
                        accountId: account.accountId,
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
): string[] {
    const providers = new Set<string>(groups.map((g) => g.provider));
    for (const connector of connectors) {
        if (!connector.enabled) continue;
        const snapshot = connector.snapshot;
        // t450：gateway（CPA）仅当 ready 快照携带 items（采集成功且有内容）时，
        // 用 items 过滤 monitor 空 provider——monitor 开关只表达「希望监控」，不等
        // 于已有该 provider 账号/用量（p217）。ready 空 items、failed/loading（含
        // 带 lastSuccess items）都无当前真相，保留全部 activeProviders：失败态供
        // banner 锚定、loading 与空 items 态维持卡片/入口不整体消失（空 provider
        // 卡短暂闪跳为 spec 已批准的 loading 语义）。
        const is_ready = snapshot.status === "ready";
        const items = snapshot_items_of(snapshot);
        if (connector.source === "gateway" && is_ready && items.length > 0) {
            const present = new Set(items.map((i) => i.provider));
            for (const provider of connector.activeProviders) {
                if (present.has(provider)) {
                    providers.add(provider);
                }
            }
            continue;
        }
        for (const provider of connector.activeProviders) {
            providers.add(provider);
        }
    }
    return [...providers].sort(compare_providers);
}

export function get_visible_providers(connectors: readonly ConnectorInfo[]): string[] {
    return visible_providers_from_groups(build_provider_usage_groups(connectors), connectors);
}

const TEN_MINUTES_MS = 10 * 60 * 1000;

// A120: resolve_convergent_time 单遍遍历查找 min/max 与最新时刻
export function resolve_convergent_time(
    timestamps: (string | null | undefined)[],
    thresholdMs?: number,
): string | null {
    let earliest = Number.POSITIVE_INFINITY;
    let latest = Number.NEGATIVE_INFINITY;
    let latest_raw: string | null = null;
    let count = 0;

    for (const t of timestamps) {
        if (!t) continue;
        const time = new Date(t).getTime();
        if (!Number.isFinite(time)) continue;
        count += 1;
        if (time < earliest) earliest = time;
        if (time > latest) {
            latest = time;
            latest_raw = t;
        }
    }

    if (count === 0) return null;
    if (count === 1) return latest_raw;
    if (latest - earliest > (thresholdMs ?? TEN_MINUTES_MS)) return null;
    return latest_raw;
}

// A120: resolve_convergent_epoch 单遍遍历查找 min/max
export function resolve_convergent_epoch(
    epochs: (number | null | undefined)[],
    thresholdMs?: number,
): number | null {
    let earliest = Number.POSITIVE_INFINITY;
    let latest = Number.NEGATIVE_INFINITY;
    let count = 0;

    for (const t of epochs) {
        if (t === null || t === undefined || !Number.isFinite(t)) continue;
        count += 1;
        if (t < earliest) earliest = t;
        if (t > latest) latest = t;
    }

    if (count === 0) return null;
    if (count === 1) return latest;
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

    // The overview path rebuilds rows from a Map keyed by the rendered label,
    // so it must apply the provider ordering again. Otherwise Grok's `credits`
    // row can move back to the position dictated by the API response order.
    // A102: 使用统一的 is_weekly_like 判定
    result.sort((a, b) => {
        if (group.provider !== "grok") return 0;
        return Number(is_weekly_like(a)) - Number(is_weekly_like(b));
    });

    if (should_log_raw) {
        log.debug("provider overview periods raw", {
            provider: group.provider,
            overviewPeriods: result,
        });
    }
    return result;
}

export interface UpcomingResetItem {
    provider: string;
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
                    metricLabel: period.display_label ?? period.name,
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

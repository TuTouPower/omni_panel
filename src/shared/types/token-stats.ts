import { z } from "zod/v3";

// --- Enums ---

export const tokenStatsSourceSchema = z.enum(["claude_code", "opencode", "kimi_code", "grok"]);
export const tokenStatsEnvSchema = z.enum(["win", "wsl"]);

// --- Stored row schemas (query results) ---

export const tokenStatsBucketSchema = z.object({
    source: tokenStatsSourceSchema,
    env: tokenStatsEnvSchema,
    bucket_date: z.string(),
    model: z.string(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    cache_write_tokens: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
});

export const tokenStatsSessionSchema = z.object({
    id: z.string(),
    source: tokenStatsSourceSchema,
    env: tokenStatsEnvSchema,
    model: z.string(),
    title: z.string().nullable(),
    directory: z.string().nullable(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    cache_write_tokens: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
    started_at: z.number(),
    ended_at: z.number(),
});

// --- Upsert delta schema ---

/**
 * A reader only reports the fields it actually knows; null means
 * "no information" and the store keeps the existing value on merge.
 * started_at/ended_at are always required (merged via MIN/MAX).
 */
export const tokenStatsSessionUpsertSchema = z.object({
    id: z.string(),
    source: tokenStatsSourceSchema,
    env: tokenStatsEnvSchema,
    model: z.string().nullable(),
    title: z.string().nullable(),
    directory: z.string().nullable(),
    input_tokens: z.number().int().nonnegative().nullable(),
    output_tokens: z.number().int().nonnegative().nullable(),
    cache_read_tokens: z.number().int().nonnegative().nullable(),
    cache_write_tokens: z.number().int().nonnegative().nullable(),
    calls: z.number().int().nonnegative().nullable(),
    started_at: z.number(),
    ended_at: z.number(),
});

// --- Per-message usage record (panel data contract) ---

/**
 * A single assistant message as seen by the usage panel. This is the only
 * contract between the data layer and the UI; downstream aggregation code must
 * not know the original source format.
 */
export const agentSessionUsageSchema = z.object({
    session_id: z.string(),
    title: z.string().nullable(),
    directory: z.string().nullable(),
    slug: z.string().nullable(),
    version: z.string().nullable(),
    parent_session_id: z.string().nullable(),
    message_id: z.string(),
    role: z.string(),
    /** Milliseconds since Unix epoch. */
    timestamp: z.number(),
    model: z.string(),
    input_tokens: z.number().int().nonnegative().default(0),
    output_tokens: z.number().int().nonnegative().default(0),
    cache_read_tokens: z.number().int().nonnegative().default(0),
    cache_write_tokens: z.number().int().nonnegative().default(0),
    agent: z.enum(["claude-code", "opencode", "kimi-code", "grok"]),
});

export type AgentSessionUsage = z.infer<typeof agentSessionUsageSchema>;

/**
 * Internal store row: adds source/env so the main process can filter and
 * key records while the renderer only deals with the public AgentSessionUsage.
 */
export const agentSessionUsageRecordSchema = agentSessionUsageSchema.extend({
    source: tokenStatsSourceSchema,
    env: tokenStatsEnvSchema,
});
export type AgentSessionUsageRecord = z.infer<typeof agentSessionUsageRecordSchema>;

// --- Daily usage delta schema ---

/**
 * Per-(session, day, model) token usage, recounted in full by the reader on
 * every scan of that session. The store REPLACEs by primary key, so recounts
 * are idempotent. Buckets are derived from these rows — this is what makes
 * "last 7 days" accurate (session cumulative snapshots can never attribute
 * usage to the day it actually happened).
 */
export const tokenStatsDailyUpsertSchema = z.object({
    id: z.string(),
    source: tokenStatsSourceSchema,
    env: tokenStatsEnvSchema,
    model: z.string(),
    /** UTC date YYYY-MM-DD of the usage (matches Claude Code /stats bucketing). */
    date: z.string(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    cache_write_tokens: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
});

// --- Collector → main process message ---

export const tokenStatsUpdateSchema = z.object({
    type: z.literal("token_stats_update"),
    sessions: z.array(tokenStatsSessionUpsertSchema),
    daily: z.array(tokenStatsDailyUpsertSchema),
    records: z.array(agentSessionUsageRecordSchema).default([]),
});

// --- Collector config ---

export const tokenStatsConfigSchema = z.object({
    win_home: z.string(),
    wsl_enabled: z.boolean(),
    wsl_distro: z.string().default("Ubuntu-22.04"),
    wsl_user: z.string(),
    poll_interval_ms: z.number().int().positive().default(600000),
    /**
     * Path to the scan-state file under the data root. The collector loads it on
     * start to resume incrementally and writes it after each scan. Empty/absent
     * disables persistence (tests). Added in t114.
     */
    state_path: z.string().default(""),
});

// --- Types ---

export type TokenStatsSource = z.infer<typeof tokenStatsSourceSchema>;
export type TokenStatsEnv = z.infer<typeof tokenStatsEnvSchema>;
export type TokenStatsBucket = z.infer<typeof tokenStatsBucketSchema>;
export type TokenStatsSession = z.infer<typeof tokenStatsSessionSchema>;
export type TokenStatsSessionUpsert = z.infer<typeof tokenStatsSessionUpsertSchema>;
export type TokenStatsDailyUpsert = z.infer<typeof tokenStatsDailyUpsertSchema>;
export type TokenStatsUpdate = z.infer<typeof tokenStatsUpdateSchema>;
export type TokenStatsConfig = z.infer<typeof tokenStatsConfigSchema>;

export interface TokenStatsRecordFilters {
    agent?: "claude-code" | "opencode" | "kimi-code" | "grok";
    env?: TokenStatsEnv;
    start?: number;
    end?: number;
    limit?: number;
}

/**
 * One weekday×hour cell of the hourly heatmap, aggregated in SQL so the
 * renderer never pulls per-message records for wide windows (t170).
 * `weekday` follows SQLite strftime('%w'): 0=Sunday..6=Saturday; the renderer
 * maps it to Monday-first grid index with `(weekday + 6) % 7`.
 */
export const tokenStatsHeatmapCellSchema = z.object({
    weekday: z.number().int().min(0).max(6),
    hour: z.number().int().min(0).max(23),
    calls: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
});
export type TokenStatsHeatmapCell = z.infer<typeof tokenStatsHeatmapCellSchema>;

export interface TokenStatsHeatmapFilters {
    agent?: "claude-code" | "opencode" | "kimi-code" | "grok";
    env?: TokenStatsEnv;
    model?: string;
    start?: number;
    end?: number;
}

/**
 * One hour×model bucket of the time-axis bar chart, aggregated in SQL (UTC+8
 * local whole hours) so wide windows (>=7d) never pull per-message records into
 * the renderer (t173). `hour_start` is the UTC epoch of the start of the local
 * hour, matching the renderer's bucketize boundaries.
 */
export const tokenStatsHourBucketSchema = z.object({
    hour_start: z.number(),
    model: z.string(),
    calls: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
});
export type TokenStatsHourBucket = z.infer<typeof tokenStatsHourBucketSchema>;

export interface TokenStatsHourFilters {
    agent?: "claude-code" | "opencode" | "kimi-code" | "grok";
    env?: TokenStatsEnv;
    model?: string;
    start?: number;
    end?: number;
}

/**
 * One (source, model, directory, session_id) rollup row over a bounded window,
 * aggregated in SQL so 24h KPI/donut/project/session axes never pull
 * per-message records (whose ORDER BY DESC LIMIT truncates high-density
 * windows, t184). No LIMIT — the row count scales with distinct group combos,
 * not per-message volume. `title` is the session's latest title (for the
 * session axis labels).
 */
export const tokenStatsRollupRowSchema = z.object({
    source: tokenStatsSourceSchema,
    model: z.string(),
    directory: z.string().nullable(),
    session_id: z.string(),
    title: z.string().nullable(),
    calls: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    cache_write_tokens: z.number().int().nonnegative(),
});
export type TokenStatsRollupRow = z.infer<typeof tokenStatsRollupRowSchema>;

export interface TokenStatsRollupFilters {
    agent?: "claude-code" | "opencode" | "kimi-code" | "grok";
    env?: TokenStatsEnv;
    model?: string;
    start?: number;
    end?: number;
}

// --- Unified dashboard query DTO (t191) ---

export const tokenStatsDashboardAgentSchema = z.enum([
    "all",
    "claude-code",
    "opencode",
    "kimi-code",
    "grok",
]);
export const tokenStatsDashboardPlatformSchema = z.enum(["all", "win", "wsl"]);
export const tokenStatsDashboardMetricSchema = z.enum(["tokens", "sessions", "calls"]);
export const tokenStatsDashboardXAxisSchema = z.enum(["time", "project", "session"]);
export const tokenStatsDashboardGranularitySchema = z.enum(["hour", "day"]);

const tokenStatsDashboardAliasSchema = z.object({
    alias: z.string().min(1),
    keys: z.array(z.string()).max(100),
});

const TOKEN_STATS_DASHBOARD_MAX_BUCKETS = 400;
const TOKEN_STATS_DASHBOARD_HOUR_MS = 60 * 60 * 1000;
const TOKEN_STATS_DASHBOARD_DAY_MS = 24 * TOKEN_STATS_DASHBOARD_HOUR_MS;
const TOKEN_STATS_DASHBOARD_MAX_GROUPS = TOKEN_STATS_DASHBOARD_MAX_BUCKETS * 100;

export const tokenStatsDashboardQuerySchema = z
    .object({
        agent: tokenStatsDashboardAgentSchema,
        platform: tokenStatsDashboardPlatformSchema,
        start: z.number().int().nonnegative().safe(),
        end: z.number().int().nonnegative().safe(),
        metric: tokenStatsDashboardMetricSchema,
        xaxis: tokenStatsDashboardXAxisSchema,
        gran: tokenStatsDashboardGranularitySchema,
        model: z.string().max(200).optional(),
        dir_aliases: z.array(tokenStatsDashboardAliasSchema).max(20).optional(),
        model_aliases: z.array(tokenStatsDashboardAliasSchema).max(20).optional(),
        session_offset: z.number().int().nonnegative().max(100_000).safe().optional(),
        session_limit: z.number().int().min(1).max(100).optional(),
    })
    .refine((query) => query.end > query.start, {
        message: "end must be greater than start",
        path: ["end"],
    })
    .refine(
        (query) =>
            query.end - query.start <=
            TOKEN_STATS_DASHBOARD_MAX_BUCKETS *
                (query.gran === "hour"
                    ? TOKEN_STATS_DASHBOARD_HOUR_MS
                    : TOKEN_STATS_DASHBOARD_DAY_MS),
        {
            message: "dashboard range produces too many buckets",
            path: ["end"],
        },
    );

export const tokenStatsDashboardNamedValueSchema = z.object({
    key: z.string(),
    value: z.number().nonnegative(),
});

export const tokenStatsDashboardSummarySchema = z.object({
    tokens: z.number().nonnegative(),
    sessions: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    cache_write_tokens: z.number().int().nonnegative(),
    agent_totals: z.array(tokenStatsDashboardNamedValueSchema).max(20),
    model_token_totals: z.array(tokenStatsDashboardNamedValueSchema).max(20),
    model_call_totals: z.array(tokenStatsDashboardNamedValueSchema).max(20),
    project_session_totals: z.array(tokenStatsDashboardNamedValueSchema).max(20),
});

export const tokenStatsDashboardChartSeriesSchema = z.object({
    name: z.string(),
    data: z.array(z.number().nonnegative()).max(TOKEN_STATS_DASHBOARD_MAX_BUCKETS + 1),
});

export const tokenStatsDashboardChartSchema = z.object({
    labels: z.array(z.string()).max(TOKEN_STATS_DASHBOARD_MAX_BUCKETS + 1),
    bucket_starts: z.array(z.number().safe()).max(TOKEN_STATS_DASHBOARD_MAX_BUCKETS + 1),
    series: z.array(tokenStatsDashboardChartSeriesSchema).max(21),
    other_details: z
        .array(z.array(z.tuple([z.string(), z.number().nonnegative()])).max(20))
        .max(TOKEN_STATS_DASHBOARD_MAX_BUCKETS + 1),
});

/** Per (bucket, model) aggregated rows for the tokens/calls time chart (t200).
 *  Metric-agnostic: both metrics are present per cell so the renderer can pick
 *  tokens or calls without a refetch. `hour_start` is the local bucket boundary
 *  (hour or day depending on the requested gran). */
export const tokenStatsDashboardMetricBucketSchema = z.object({
    hour_start: z.number(),
    model: z.string(),
    calls: z.number().int().nonnegative(),
    tokens: z.number().int().nonnegative(),
});

/** Per (bucket, directory) distinct-session rows for the sessions time chart
 *  (t200). Cannot be derived from the metric buckets by summing across models
 *  (a session spanning models within a bucket would double count), so the
 *  distinct count is computed at this granularity in SQL. */
export const tokenStatsDashboardSessionBucketSchema = z.object({
    hour_start: z.number(),
    directory: z.string(),
    sessions: z.number().int().nonnegative(),
});

/** Metric-agnostic dashboard chart source data (t200). The renderer derives
 *  the chart for the current metric/xaxis locally from these bounded rows, so
 *  switching display dimensions never refetches the dashboard. `axis` is the
 *  server-built time-axis (labels + bucket boundaries at the requested gran)
 *  so the renderer maps buckets onto the exact axis the server used. */
export const tokenStatsDashboardChartAxisSchema = z.object({
    labels: z.array(z.string()).max(TOKEN_STATS_DASHBOARD_MAX_BUCKETS + 1),
    bucket_starts: z.array(z.number().safe()).max(TOKEN_STATS_DASHBOARD_MAX_BUCKETS + 1),
});

export const tokenStatsDashboardChartDataSchema = z.object({
    axis: tokenStatsDashboardChartAxisSchema,
    metric_buckets: z
        .array(tokenStatsDashboardMetricBucketSchema)
        .max(TOKEN_STATS_DASHBOARD_MAX_GROUPS),
    session_buckets: z
        .array(tokenStatsDashboardSessionBucketSchema)
        .max(TOKEN_STATS_DASHBOARD_MAX_GROUPS),
    rollup: z.array(tokenStatsRollupRowSchema),
});

/** Distinct model names present in the queried window (t204 model filter). */
export const tokenStatsDashboardModelSchema = z.string().max(200);

export const tokenStatsDashboardSessionsQuerySchema = z
    .object({
        agent: tokenStatsDashboardAgentSchema,
        platform: tokenStatsDashboardPlatformSchema,
        start: z.number().int().nonnegative().safe(),
        end: z.number().int().nonnegative().safe(),
        model: z.string().max(200).optional(),
        dir_aliases: z.array(tokenStatsDashboardAliasSchema).max(20).optional(),
        model_aliases: z.array(tokenStatsDashboardAliasSchema).max(20).optional(),
        session_offset: z.number().int().nonnegative().max(100_000).safe().optional(),
        session_limit: z.number().int().min(1).max(100).optional(),
    })
    .refine((query) => query.end > query.start, {
        message: "end must be greater than start",
        path: ["end"],
    });

export const tokenStatsDashboardSessionSummarySchema = z.object({
    session_id: z.string(),
    source: tokenStatsSourceSchema,
    env: tokenStatsEnvSchema,
    title: z.string().nullable(),
    directory: z.string().nullable(),
    models: z.array(z.string()).max(50),
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    cache_read_tokens: z.number().int().nonnegative(),
    cache_write_tokens: z.number().int().nonnegative(),
    calls: z.number().int().nonnegative(),
    started_at: z.number(),
    ended_at: z.number(),
});

export const tokenStatsDashboardSessionsDtoSchema = z.object({
    items: z.array(tokenStatsDashboardSessionSummarySchema).max(100),
    total: z.number().int().nonnegative(),
    has_more: z.boolean(),
});

export const tokenStatsDashboardDtoSchema = z.object({
    query: tokenStatsDashboardQuerySchema,
    current: tokenStatsDashboardSummarySchema,
    previous: tokenStatsDashboardSummarySchema,
    chart_data: tokenStatsDashboardChartDataSchema,
    heatmap: z.array(tokenStatsHeatmapCellSchema),
    /** Distinct model names present in the queried window (t204). */
    models: z.array(tokenStatsDashboardModelSchema).max(500),
    sessions: z.object({
        items: z.array(tokenStatsDashboardSessionSummarySchema).max(100),
        total: z.number().int().nonnegative(),
        has_more: z.boolean(),
    }),
    status: z.object({
        running: z.boolean(),
        last_updated: z.number().nullable(),
    }),
    freshness: z.object({
        queried_at: z.number().nonnegative(),
        stale: z.boolean(),
    }),
    /** Monotonic committed-data version (t192); renderer compares against its
     *  cached payload to decide staleness without trusting local clocks. */
    data_version: z.number().int().nonnegative(),
});

export type TokenStatsDashboardAgent = z.infer<typeof tokenStatsDashboardAgentSchema>;
export type TokenStatsDashboardPlatform = z.infer<typeof tokenStatsDashboardPlatformSchema>;
export type TokenStatsDashboardMetric = z.infer<typeof tokenStatsDashboardMetricSchema>;
export type TokenStatsDashboardXAxis = z.infer<typeof tokenStatsDashboardXAxisSchema>;
export type TokenStatsDashboardGranularity = z.infer<typeof tokenStatsDashboardGranularitySchema>;
export type TokenStatsDashboardQuery = z.infer<typeof tokenStatsDashboardQuerySchema>;
export type TokenStatsDashboardNamedValue = z.infer<typeof tokenStatsDashboardNamedValueSchema>;
export type TokenStatsDashboardSummary = z.infer<typeof tokenStatsDashboardSummarySchema>;
export type TokenStatsDashboardChart = z.infer<typeof tokenStatsDashboardChartSchema>;
export type TokenStatsDashboardMetricBucket = z.infer<typeof tokenStatsDashboardMetricBucketSchema>;
export type TokenStatsDashboardSessionBucket = z.infer<
    typeof tokenStatsDashboardSessionBucketSchema
>;
export type TokenStatsDashboardChartData = z.infer<typeof tokenStatsDashboardChartDataSchema>;
export type TokenStatsDashboardSessionsQuery = z.infer<
    typeof tokenStatsDashboardSessionsQuerySchema
>;
export type TokenStatsDashboardSessionsDto = z.infer<typeof tokenStatsDashboardSessionsDtoSchema>;
export type TokenStatsDashboardSessionSummary = z.infer<
    typeof tokenStatsDashboardSessionSummarySchema
>;
export type TokenStatsDashboardDto = z.infer<typeof tokenStatsDashboardDtoSchema>;

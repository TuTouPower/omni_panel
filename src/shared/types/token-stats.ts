import { z } from "zod/v3";

// --- Enums ---

export const tokenStatsSourceSchema = z.enum(["claude_code", "opencode"]);
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
    agent: z.enum(["claude-code", "opencode"]),
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

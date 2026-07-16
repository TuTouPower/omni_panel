import { z } from "zod/v3";

// --- Enums ---

export const tokenStatsSourceSchema = z.enum(["claude_code", "opencode"]);
export const tokenStatsEnvSchema = z.enum(["win", "wsl"]);

// --- Schemas ---

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

export const tokenStatsUpdateSchema = z.object({
    type: z.literal("token_stats_update"),
    buckets: z.array(tokenStatsBucketSchema),
    sessions: z.array(tokenStatsSessionSchema),
});

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
export type TokenStatsUpdate = z.infer<typeof tokenStatsUpdateSchema>;
export type TokenStatsConfig = z.infer<typeof tokenStatsConfigSchema>;

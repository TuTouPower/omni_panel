import { z } from "zod/v3";

const usageDisplayStyleSchema = z.enum(["percent", "ratio"]);
const usageStatusSchema = z.enum(["normal", "warning", "critical", "unknown"]);
const usageColorSchema = z.enum(["blue", "green", "yellow", "orange", "red"]);
export const usageProviderSchema = z.enum([
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
    "brave",
]);
export const usageSourceSchema = z.enum(["cpa", "direct", "local", "api_key", "oauth"]);

const finiteNumber = z.number().finite();

const usageItemSchema = z.object({
    id: z.string(),
    provider: usageProviderSchema,
    source: usageSourceSchema,
    sourceInstanceId: z.string(),
    accountId: z.string(),
    accountLabel: z.string(),
    name: z.string(),
    used: finiteNumber.nullable(),
    limit: finiteNumber,
    displayStyle: usageDisplayStyleSchema,
    resetAt: z.string().nullable().optional(),
    status: usageStatusSchema.default("unknown"),
    color: usageColorSchema.optional(),
    observedAt: z.string().optional(),
    stale: z.boolean().optional(),
});

const pluginChartSegmentSchema = z.object({
    model: z.string(),
    tokens: finiteNumber,
});

const pluginChartBucketSchema = z.object({
    id: z.string().optional(),
    label: z.string(),
    segments: z.array(pluginChartSegmentSchema),
});

const pluginChartSchema = z.object({
    kind: z.string(),
    period: z.string(),
    bucketUnit: z.enum(["hour", "day"]),
    buckets: z.array(pluginChartBucketSchema),
    message: z.string().nullable().optional(),
});

// --- Discriminated union schema ---

export const pluginSuccessOutputSchema = z.object({
    success: z.literal(true),
    schemaVersion: z.literal(2),
    updatedAt: z.string(),
    items: z.array(usageItemSchema),
    badge: z.string().optional(),
    chart: pluginChartSchema.optional(),
});

export const pluginFailureOutputSchema = z.object({
    success: z.literal(false),
    error: z.object({
        code: z.string(),
        message: z.string(),
    }),
});

export const pluginResultSchema = z.discriminatedUnion("success", [
    pluginSuccessOutputSchema,
    pluginFailureOutputSchema,
]);

// --- Types ---

export type UsageProvider = z.infer<typeof usageProviderSchema>;
export type UsageSource = z.infer<typeof usageSourceSchema>;
export type UsageItem = z.infer<typeof usageItemSchema>;
export type PluginChart = z.infer<typeof pluginChartSchema>;
export type PluginSuccessOutput = z.infer<typeof pluginSuccessOutputSchema>;
export type PluginFailureOutput = z.infer<typeof pluginFailureOutputSchema>;
export type PluginResult = z.infer<typeof pluginResultSchema>;

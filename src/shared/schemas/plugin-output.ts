import { z } from "zod/v3";

export const usageDisplayStyleSchema = z.enum(["percent", "ratio"]);
export const usageStatusSchema = z.enum(["normal", "warning", "critical", "unknown"]);
export const usageColorSchema = z.enum(["blue", "green", "yellow", "orange", "red"]);
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
]);
export const usageSourceSchema = z.enum(["cpa", "direct", "local", "api_key", "oauth"]);

const finiteNonNegative = z.number().finite().nonnegative();

export const usageItemSchema = z.object({
    id: z.string(),
    provider: usageProviderSchema,
    source: usageSourceSchema,
    sourceInstanceId: z.string(),
    accountId: z.string(),
    accountLabel: z.string(),
    name: z.string(),
    used: finiteNonNegative.nullable(),
    limit: finiteNonNegative,
    displayStyle: usageDisplayStyleSchema,
    resetAt: z.string().nullable().optional(),
    status: usageStatusSchema.default("unknown"),
    color: usageColorSchema.optional(),
});

export const pluginChartSegmentSchema = z.object({
    model: z.string(),
    tokens: finiteNonNegative,
});

export const pluginChartBucketSchema = z.object({
    id: z.string().optional(),
    label: z.string(),
    segments: z.array(pluginChartSegmentSchema),
});

export const pluginChartSchema = z.object({
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

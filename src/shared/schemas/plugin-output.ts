import { z } from "zod/v3";

const usageDisplayStyleSchema = z.enum(["percent", "ratio"]);
const usageStatusSchema = z.enum(["normal", "warning", "critical", "unknown"]);
const usageColorSchema = z.enum(["blue", "green", "yellow", "orange", "red"]);
export const usageProviderSchema = z.enum([
    "claude",
    "codex",
    "antigravity",
    "kimi",
    "glm",
    "minimax",
    "deepseek",
    "getoneapi",
    "tavily",
    "firecrawl",
    "exa",
    "tikhub",
    "mimo",
    "opencode_go",
    "grok",
]);
export const usageSourceSchema = z.enum([
    "poll",
    "local",
    "session",
    "wrapper",
    "probe",
    "gateway",
]);

const finiteNumber = z.number().finite();

const usageItemSchema = z.object({
    id: z.string(),
    provider: usageProviderSchema,
    source: usageSourceSchema,
    sourceInstanceId: z.string(),
    accountId: z.string(),
    accountLabel: z.string(),
    /**
     * Stable raw key / raw label emitted by the connector. Used as the key
     * for label-map configuration. Examples: `five_hour`, `primary_window`,
     * `balance`.
     */
    raw_label: z.string(),
    /**
     * Connector-normalized intermediate label. Used as the default display
     * value when the user has not configured a mapping. Examples: `5小时`,
     * `余额`.
     */
    normalized_label: z.string(),
    /**
     * User-configured final display label. When present, the UI shows it
     * verbatim without any built-in shortening.
     */
    display_label: z.string().optional(),
    /**
     * @deprecated Use `normalized_label`. Retained as an alias so existing
     * serialized snapshots keep working while the runtime migrates over.
     */
    name: z.string().optional(),
    used: finiteNumber.nullable(),
    limit: finiteNumber.nullable(),
    displayStyle: usageDisplayStyleSchema,
    resetAt: finiteNumber.nullable(),
    cycleDurationMs: finiteNumber.nonnegative().nullable().optional(),
    status: usageStatusSchema.default("unknown"),
    color: usageColorSchema.optional(),
    observedAt: finiteNumber,
    stale: z.boolean(),
    error: z.string().optional(),
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
// TypeScript type/interface names use PascalCase per TS ecosystem convention.
// The project's snake_case naming rule applies to variables, functions, files,
// and directories — not type names, which universally follow PascalCase.

export type UsageProvider = z.infer<typeof usageProviderSchema>;
export type UsageSource = z.infer<typeof usageSourceSchema>;
export type MetricRecord = z.infer<typeof usageItemSchema>;
/** @deprecated Use MetricRecord */
export type UsageItem = MetricRecord;
export type PluginChart = z.infer<typeof pluginChartSchema>;
export type PluginSuccessOutput = z.infer<typeof pluginSuccessOutputSchema>;
export type PluginFailureOutput = z.infer<typeof pluginFailureOutputSchema>;
export type PluginResult = z.infer<typeof pluginResultSchema>;

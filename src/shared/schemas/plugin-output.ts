import { z } from "zod/v3";

export const usageDisplayStyleSchema = z.enum(["percent", "ratio"]);
export const usageStatusSchema = z.enum(["normal", "warning", "critical", "unknown"]);
export const usageColorSchema = z.enum(["blue", "green", "yellow", "orange", "red"]);

export const usageItemSchema = z.object({
    id: z.string(),
    name: z.string(),
    used: z.number(),
    limit: z.number(),
    displayStyle: usageDisplayStyleSchema,
    resetAt: z.string().optional(),
    status: usageStatusSchema.default("unknown"),
    color: usageColorSchema.optional(),
});

export const pluginChartSegmentSchema = z.object({
    model: z.string(),
    tokens: z.number(),
});

export const pluginChartBucketSchema = z.object({
    label: z.string(),
    segments: z.array(pluginChartSegmentSchema),
});

export const pluginChartSchema = z.object({
    kind: z.string(),
    period: z.string(),
    bucketUnit: z.enum(["hour", "day"]),
    buckets: z.array(pluginChartBucketSchema),
    message: z.string().optional(),
});

export const pluginOutputSchema = z.object({
    schemaVersion: z.number(),
    updatedAt: z.string(),
    items: z.array(usageItemSchema),
    badge: z.string().optional(),
    chart: pluginChartSchema.optional(),
});

export const pluginErrorOutputSchema = z.object({
    error: z.string(),
});

export type UsageItem = z.infer<typeof usageItemSchema>;
export type PluginOutput = z.infer<typeof pluginOutputSchema>;
export type PluginChart = z.infer<typeof pluginChartSchema>;
export type PluginErrorOutput = z.infer<typeof pluginErrorOutputSchema>;

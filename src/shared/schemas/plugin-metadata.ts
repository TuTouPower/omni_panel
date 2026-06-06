import { z } from "zod/v3";
import { usageProviderSchema, usageSourceSchema } from "./plugin-output";

export const pluginParameterTypeSchema = z.enum([
    "string",
    "secret",
    "integer",
    "boolean",
    "choice",
    "directory",
    "file",
]);

export const pluginParameterOptionSchema = z
    .object({
        label: z.string(),
        value: z.string(),
        // localization fields
        "label@zh-Hans": z.string().optional(),
        "label@en": z.string().optional(),
    })
    .strict();

export const pluginParameterMetadataSchema = z
    .object({
        name: z.string(),
        label: z.string(),
        type: pluginParameterTypeSchema,
        required: z.boolean(),
        placeholder: z.string().optional(),
        description: z.string().optional(),
        defaultValue: z.string().optional(),
        options: z.array(pluginParameterOptionSchema).optional(),
        // localization fields
        "label@zh-Hans": z.string().optional(),
        "label@en": z.string().optional(),
    })
    .strict();

export const pluginEndpointsSchema = z.record(z.string().url().nullable());

export const pluginMetadataSchema = z
    .object({
        schemaVersion: z.number().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        parameters: z.array(pluginParameterMetadataSchema).optional(),
        endpoints: pluginEndpointsSchema.optional(),
        supportedProviders: z.array(usageProviderSchema).optional(),
        defaultSource: usageSourceSchema.optional(),
        // localization fields
        "name@zh-Hans": z.string().optional(),
        "name@en": z.string().optional(),
        "description@zh-Hans": z.string().optional(),
        "description@en": z.string().optional(),
    })
    .strict();

export type PluginMetadata = z.infer<typeof pluginMetadataSchema>;
export type PluginParameterMetadata = z.infer<typeof pluginParameterMetadataSchema>;

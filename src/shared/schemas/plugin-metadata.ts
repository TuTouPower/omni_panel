import { z } from "zod/v3";

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
    })
    .passthrough();

export const pluginParameterMetadataSchema = z
    .object({
        name: z.string(),
        label: z.string(),
        type: pluginParameterTypeSchema,
        required: z.boolean(),
        placeholder: z.string().optional(),
        defaultValue: z.string().optional(),
        options: z.array(pluginParameterOptionSchema).optional(),
    })
    .passthrough();

export const pluginEndpointsSchema = z.record(z.string().url().nullable());

export const pluginMetadataSchema = z
    .object({
        name: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        parameters: z.array(pluginParameterMetadataSchema).optional(),
        endpoints: pluginEndpointsSchema.optional(),
    })
    .passthrough();

export type PluginMetadata = z.infer<typeof pluginMetadataSchema>;
export type PluginParameterMetadata = z.infer<typeof pluginParameterMetadataSchema>;

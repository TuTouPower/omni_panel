import { z } from "zod";

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
    .catchall(z.string());

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
    .catchall(z.string());

export const pluginMetadataSchema = z
    .object({
        name: z.string().optional(),
        description: z.string().optional(),
        icon: z.string().optional(),
        parameters: z.array(pluginParameterMetadataSchema).optional(),
    })
    .catchall(z.string());

export type PluginMetadata = z.infer<typeof pluginMetadataSchema>;
export type PluginParameterMetadata = z.infer<typeof pluginParameterMetadataSchema>;

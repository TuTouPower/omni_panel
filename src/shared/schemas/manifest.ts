import { z } from "zod/v3";
import { usageProviderSchema } from "./plugin-output";

/**
 * Connector-level provider whitelist.
 *
 * Extends `usageProviderSchema` with meta-providers that exist only at the
 * connector layer (e.g. "cpa" aggregates claude/gemini/… but never appears
 * as a runtime usage provider).
 */
export const connectorProviderSchema = usageProviderSchema.or(z.literal("cpa"));

const capability_schema = z.enum(["poll", "local", "session", "observe"]);

const parameter_schema = z.object({
    name: z.string().min(1),
    type: z.enum(["secret", "string", "number"]),
    required: z.boolean().default(false),
    label: z.string().optional(),
    "label@zh-Hans": z.string().optional(),
    default: z.string().optional(),
    exposeToScript: z.boolean().default(false),
});

const auth_schema = z.object({
    type: z.enum(["bearer", "query", "header"]),
    secret: z.string().min(1),
    header_name: z.string().optional(),
    query_param: z.string().optional(),
});

const poll_request_schema = z.object({
    endpoint: z.string().min(1),
    path: z.string().min(1),
    method: z.enum(["GET", "POST"]).default("GET"),
    auth: auth_schema.optional(),
    body: z.unknown().optional(),
});

const poll_map_schema = z.record(z.string(), z.string());

const poll_config_schema = z.object({
    request: poll_request_schema,
    map: poll_map_schema,
});

const observe_config_schema = z.object({
    headers: z.array(z.string()).min(1),
    probe: z
        .object({
            endpoint: z.string().min(1),
            path: z.string().min(1),
            params: z.record(z.string(), z.string()).optional(),
        })
        .optional(),
});

const local_config_schema = z.object({
    paths: z.array(z.string()).min(1),
});

export const manifest_schema = z
    .object({
        id: z.string().min(1),
        provider: connectorProviderSchema,
        capabilities: z.array(capability_schema).min(1),
        parameters: z.array(parameter_schema).default([]),
        endpoints: z.record(z.string(), z.string().url()).optional(),
        requireExplicitEndpoints: z.boolean().optional(),
        manualDefault: z.boolean().optional(),
        script: z.string().optional(),
        poll: poll_config_schema.optional(),
        observe: observe_config_schema.optional(),
        local: local_config_schema.optional(),
    })
    .strict()
    .refine(
        (manifest) =>
            manifest.capabilities.every((capability) => {
                if (capability === "poll") return !!manifest.poll;
                if (capability === "observe") return !!manifest.observe;
                if (capability === "local") return !!manifest.local;
                return true;
            }),
        { message: "Each capability requires its corresponding config section" },
    );

export type Manifest = z.infer<typeof manifest_schema>;

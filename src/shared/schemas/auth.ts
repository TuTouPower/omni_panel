import { z } from "zod/v3";

export const authMethodSchema = z.enum([
    "apikey",
    "oauth_device",
    "web_login",
    "cpa_mgmt",
    "local_cli",
]);

export const authDescriptorSchema = z
    .object({
        method: authMethodSchema,
        secret_name: z.string().min(1),
        extra_fields: z.array(z.string().min(1)).optional(),
        login_url: z.string().url().optional(),
        require_endpoint: z.boolean().optional(),
    })
    .strict();

export type AuthMethod = z.infer<typeof authMethodSchema>;
export type AuthDescriptor = z.infer<typeof authDescriptorSchema>;

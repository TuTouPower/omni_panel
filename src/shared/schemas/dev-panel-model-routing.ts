import { z } from "zod/v3";

export const devPanelModelRoutingSaveRequestSchema = z.object({
    selections: z.record(z.string().min(1), z.string().min(1)),
    confirmed: z.literal(true),
});

export const devPanelModelRoutingTestRequestSchema = z.object({
    slot: z.string().min(1),
    model: z.string().min(1),
});

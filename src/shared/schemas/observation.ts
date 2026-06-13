import { z } from "zod/v3";

export const observation_window_schema = z.enum(["second", "day", "month", "total"]);
export const observation_display_style_schema = z.enum(["percent", "ratio"]);
export const observation_status_schema = z.enum(["normal", "warning", "critical", "unknown"]);
export const observation_source_schema = z.enum([
    "poll",
    "local",
    "session",
    "wrapper",
    "probe",
    "gateway",
]);

const finite_number = z.number().finite();

export const observation_schema = z.object({
    provider: z.string().min(1),
    source_instance_id: z.string().min(1),
    account_id: z.string().min(1),
    account_label: z.string(),
    metric_id: z.string().min(1),
    name: z.string().min(1),
    window: observation_window_schema,
    used: finite_number.nullable(),
    limit: finite_number.nullable(),
    display_style: observation_display_style_schema,
    reset_at: finite_number.nullable(),
    status: observation_status_schema,
    observed_at: finite_number,
    source: observation_source_schema,
    stale: z.boolean(),
    last_error: z.string().nullable(),
});

export const observation_ingest_schema = observation_schema
    .omit({
        observed_at: true,
        stale: true,
        last_error: true,
    })
    .extend({
        source: observation_source_schema,
    });

export type ObservationInput = z.infer<typeof observation_ingest_schema>;

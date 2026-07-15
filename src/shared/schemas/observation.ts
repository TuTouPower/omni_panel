import { z } from "zod/v3";

export const observation_window_schema = z.enum(["second", "day", "week", "month", "total"]);
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

/**
 * What a connector (script / poll / probe) produces. Connectors discover
 * accounts and metrics at runtime but CANNOT know which connector instance
 * they run under — instance identity is host authority. The script-output
 * contract therefore deliberately omits source_instance_id.
 */
export const script_observation_schema = z.object({
    provider: z.string().min(1),
    account_id: z.string().min(1),
    account_label: z.string(),
    metric_id: z.string().min(1),
    raw_label: z.string().min(1),
    normalized_label: z.string().min(1),
    display_label: z.string().optional(),
    /**
     * @deprecated Retained as an optional alias of normalized_label while the
     * codebase migrates. New connectors should emit raw_label +
     * normalized_label.
     */
    name: z.string().optional(),
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

/**
 * Full observation = script output + host-stamped instance identity.
 * source_instance_id is injected solely by execute_connector (the single
 * authority) and never appears in connector script output.
 */
export const observation_schema = script_observation_schema.extend({
    source_instance_id: z.string().min(1),
});

export const observation_ingest_schema = observation_schema.omit({
    observed_at: true,
    stale: true,
    last_error: true,
});

export type ObservationInput = z.infer<typeof observation_ingest_schema>;

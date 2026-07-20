import { createLogger } from "../../../shared/lib/logger";
import { usageProviderSchema, type MetricRecord } from "../../../shared/schemas/plugin-output";
import type { Observation } from "../../../shared/types/observation";

const log = createLogger("observation-mapping");

/**
 * The single source of truth for turning connector observations into the
 * runtime store's ready-state payload.
 *
 * Both the live refresh path (refresh-service) and the startup hydrate path
 * (hydrate-runtime-store) used to map observations independently, and the two
 * copies drifted: hydrate derived `source` from the manifest id (forcing
 * non-CPA connectors to "poll", mislabelling e.g. mimo "session" data), while
 * refresh used the script-declared `obs.source`. They now share this module.
 *
 * Deep module: one small interface (`observations_to_ready_state`) hides
 * provider validation, field mapping, null-filtering, and updatedAt reduction.
 */
export interface ReadyState {
    readonly items: readonly MetricRecord[];
    readonly updatedAt: Date;
}

export function observation_to_metric_record(obs: Observation): MetricRecord | null {
    const provider = usageProviderSchema.safeParse(obs.provider);
    if (!provider.success) {
        log.warn(`Skipping observation with invalid provider: ${obs.provider} (${obs.metric_id})`);
        return null;
    }
    return {
        id: `${obs.source_instance_id}:${obs.account_id}:${obs.metric_id}`,
        provider: provider.data,
        source: obs.source,
        sourceInstanceId: obs.source_instance_id,
        accountId: obs.account_id,
        accountLabel: obs.account_label,
        raw_label: obs.raw_label,
        normalized_label: obs.normalized_label,
        ...(obs.display_label !== undefined && { display_label: obs.display_label }),
        used: obs.used,
        limit: obs.limit,
        cycleDurationMs: obs.cycleDurationMs,
        displayStyle: obs.display_style,
        resetAt: obs.reset_at,
        status: obs.status,
        observedAt: obs.observed_at,
        stale: obs.stale,
        ...(obs.last_error != null && { error: obs.last_error }),
    };
}

export function observations_to_ready_state(observations: readonly Observation[]): ReadyState {
    const items: MetricRecord[] = [];
    for (const obs of observations) {
        const record = observation_to_metric_record(obs);
        if (record) items.push(record);
    }
    const latest_observed_at =
        observations.length > 0
            ? observations.reduce((max, obs) => Math.max(max, obs.observed_at), 0)
            : Date.now();
    return { items, updatedAt: new Date(latest_observed_at) };
}

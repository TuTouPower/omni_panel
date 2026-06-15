import { usageProviderSchema } from "../../../shared/schemas/plugin-output";
import type { MetricRecord } from "../../../shared/schemas/plugin-output";
import type { ConnectorConfiguration } from "../../../shared/types/config";
import type { Observation } from "../../../shared/types/observation";
import type { ObservationStore } from "../observation/observation-store";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import type { RuntimeStore } from "./runtime-store";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("hydrate-runtime-store");

interface HydrateDeps {
    readonly runtimeStore: RuntimeStore;
    readonly observationStore: ObservationStore;
    readonly connectorConfigs: readonly ConnectorConfiguration[];
    readonly definitions: readonly ConnectorDefinition[];
}

function observation_to_metric_record(
    obs: Observation,
    definition: ConnectorDefinition,
): MetricRecord | null {
    const provider = usageProviderSchema.safeParse(obs.provider);
    if (!provider.success) return null;

    return {
        id: `${obs.source_instance_id}:${obs.account_id}:${obs.metric_id}`,
        provider: provider.data,
        source: definition.manifest.id === "cpa" ? "cpa" : "direct",
        sourceInstanceId: obs.source_instance_id,
        accountId: obs.account_id,
        accountLabel: obs.account_label,
        raw_label: obs.raw_label,
        normalized_label: obs.normalized_label,
        used: obs.used,
        limit: obs.limit ?? 0,
        displayStyle: obs.display_style,
        resetAt: obs.reset_at === null ? null : new Date(obs.reset_at).toISOString(),
        status: obs.status,
        observedAt: new Date(obs.observed_at).toISOString(),
        stale: obs.stale,
    };
}

export function hydrate_runtime_store(deps: HydrateDeps): void {
    for (const config of deps.connectorConfigs) {
        if (!config.manualRefreshOnly) continue;

        const definition = deps.definitions.find((d) => d.executablePath === config.executablePath);
        if (!definition) continue;

        const observations = deps.observationStore.list_by_source_instance_id(config.instanceId);
        if (observations.length === 0) continue;

        const items: MetricRecord[] = [];
        for (const obs of observations) {
            const record = observation_to_metric_record(obs, definition);
            if (record) items.push(record);
        }
        if (items.length === 0) continue;

        const updatedAt = new Date(
            observations.reduce((max, obs) => Math.max(max, obs.observed_at), 0),
        );

        deps.runtimeStore.updateState(config.instanceId, {
            status: "ready",
            items,
            updatedAt,
        });

        log.info(
            `Hydrated ${config.name} (${config.instanceId}): ${String(items.length)} items from observation store`,
        );
    }
}

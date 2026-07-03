import type { ConnectorConfiguration } from "../../../shared/types/config";
import type { AsyncObservationStore } from "../observation/observation-store-async";
import type { ConnectorDefinition } from "../connector/manifest-loader";
import type { RuntimeStore } from "./runtime-store";
import { observations_to_ready_state } from "./observation-mapping";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("hydrate-runtime-store");

interface HydrateDeps {
    readonly runtimeStore: RuntimeStore;
    readonly observationStore: AsyncObservationStore;
    readonly connectorConfigs: readonly ConnectorConfiguration[];
    readonly definitions: readonly ConnectorDefinition[];
}

export async function hydrate_runtime_store(deps: HydrateDeps): Promise<void> {
    // DESIGN: only manualRefreshOnly connectors are restored from the
    // observation store on startup.  Auto-refresh connectors will re-populate
    // on their next scheduled run, so showing stale data for them would be
    // misleading.  This is an intentional trade-off, not a bug.
    for (const config of deps.connectorConfigs) {
        if (!config.manualRefreshOnly) continue;

        const definition = deps.definitions.find((d) => d.executablePath === config.executablePath);
        if (!definition) continue;

        const observations = await deps.observationStore.list_by_source_instance_id(
            config.instanceId,
        );
        if (observations.length === 0) continue;

        const { items, updatedAt } = observations_to_ready_state(observations);
        if (items.length === 0) {
            log.warn(
                `Hydrate ${config.instanceId}: all ${String(observations.length)} observations failed provider validation`,
            );
            continue;
        }

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

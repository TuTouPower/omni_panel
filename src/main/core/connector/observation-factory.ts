import type { Manifest } from "../../../shared/schemas/manifest";
import type { ObservationWindow, ScriptObservation } from "../../../shared/types/observation";

/** t360: probe/poll 执行器共享的 ScriptObservation 构造。window/source/used/limit
 *  为各执行器专属，其余字段同构。 */
export function build_single_observation(
    manifest: Manifest,
    opts: {
        window: ObservationWindow;
        source: "probe" | "poll";
        used: number | null;
        limit: number | null;
    },
): ScriptObservation {
    return {
        provider: manifest.provider,
        account_id: "default",
        account_label: manifest.provider,
        metric_id: `${manifest.id}:usage`,
        raw_label: "usage",
        normalized_label: "Usage",
        window: opts.window,
        cycleDurationMs: null,
        used: opts.used,
        limit: opts.limit,
        display_style: "ratio",
        reset_at: null,
        status: "normal",
        observed_at: Date.now(),
        source: opts.source,
        stale: false,
        last_error: null,
    };
}

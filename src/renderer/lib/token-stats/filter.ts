import type { AgentSessionUsage, FilterOpts } from "./types";

/**
 * Single exit point for filtering records by agent and time range.
 * All downstream aggregation code must use this function.
 */
export function filtered(records: AgentSessionUsage[], opts: FilterOpts): AgentSessionUsage[] {
    return records.filter(
        (r) =>
            r.timestamp >= opts.start &&
            r.timestamp <= opts.end &&
            (opts.agent === "all" || r.agent === opts.agent),
    );
}

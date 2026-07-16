import type { MetricRecord } from "../../shared/schemas/plugin-output";

/**
 * Shared row shape for label map UIs.
 *  - raw:     always item.raw_label (the key format_usage_period_label looks up)
 *  - default: display fallback without user override (normalized / caller normalize)
 *  - display: existing override → caller fallback → default
 */
export interface LabelMapRow {
    readonly raw: string;
    readonly default: string;
    readonly display: string;
}

/**
 * Build label map rows for a connector's current snapshot.
 *
 * Key invariant: KEY IS ALWAYS item.raw_label. This is what
 * format_usage_period_label uses at render time; any other key would
 * silently break the mapping.
 *
 * De-duplicates by raw_label (first occurrence wins).
 */
export function build_label_map_rows(
    items: readonly MetricRecord[],
    existing_map?: Readonly<Record<string, string>>,
    normalize_for_display?: (item: MetricRecord) => string,
): LabelMapRow[] {
    const seen = new Set<string>();
    const rows: LabelMapRow[] = [];
    for (const item of items) {
        const raw = item.raw_label;
        if (seen.has(raw)) continue;
        seen.add(raw);
        const fallback = normalize_for_display?.(item) ?? item.normalized_label;
        rows.push({
            raw,
            default: fallback,
            display: existing_map?.[raw] ?? fallback,
        });
    }
    return rows;
}

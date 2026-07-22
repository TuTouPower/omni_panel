import type { MetricRecord } from "../../shared/schemas/plugin-output";
import { accountKey } from "./provider-usage";

/**
 * Shared row shape for label map UIs.
 *  - raw:          always item.raw_label (the key format_usage_period_label looks up)
 *  - default:      display fallback without user override (normalized / caller normalize)
 *  - display:      existing override → caller fallback → default
 *  - account_keys  t048: distinct accountKey(item) values across items sharing this
 *                  raw_label. Used by SettingsForm to drive the per-raw_label
 *                  upcoming-reset watch bell (since dedup drops accountKey).
 */
export interface LabelMapRow {
    readonly raw: string;
    readonly default: string;
    readonly display: string;
    readonly account_keys: readonly string[];
}

/**
 * Build label map rows for a connector's current snapshot.
 *
 * Key invariant: KEY IS ALWAYS item.raw_label. This is what
 * format_usage_period_label uses at render time; any other key would
 * silently break the mapping.
 *
 * De-duplicates by raw_label (first occurrence wins). account_keys merges
 * the distinct accountKey(item) values for every item sharing that raw_label.
 */
export function build_label_map_rows(
    items: readonly MetricRecord[],
    existing_map?: Readonly<Record<string, string>>,
    normalize_for_display?: (item: MetricRecord) => string,
): LabelMapRow[] {
    interface MutableRow {
        raw: string;
        default: string;
        display: string;
        account_keys: string[];
    }
    const by_raw = new Map<string, MutableRow>();
    for (const item of items) {
        const raw = item.raw_label;
        const key = accountKey(item);
        const existing = by_raw.get(raw);
        if (existing) {
            if (!existing.account_keys.includes(key)) existing.account_keys.push(key);
            continue;
        }
        const fallback = normalize_for_display?.(item) ?? item.normalized_label;
        by_raw.set(raw, {
            raw,
            default: fallback,
            display: existing_map?.[raw] ?? fallback,
            account_keys: [key],
        });
    }
    return Array.from(
        by_raw.values(),
        (r): LabelMapRow => ({ ...r, account_keys: r.account_keys }),
    );
}

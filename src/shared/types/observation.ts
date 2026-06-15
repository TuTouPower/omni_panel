export type ObservationWindow = "second" | "day" | "month" | "total";
export type ObservationDisplayStyle = "percent" | "ratio";
export type ObservationStatus = "normal" | "warning" | "critical" | "unknown";
export type ObservationSource = "poll" | "local" | "session" | "wrapper" | "probe" | "gateway";

export interface Observation {
    readonly provider: string;
    readonly source_instance_id: string;
    readonly account_id: string;
    readonly account_label: string;
    readonly metric_id: string;
    /**
     * Stable raw key / raw label for this metric (e.g. `five_hour`,
     * `primary_window`, `balance`). The label-map uses this as its key.
     */
    readonly raw_label: string;
    /**
     * Connector-normalized intermediate label (e.g. `5小时`, `余额`).
     * Default display value when no mapping exists.
     */
    readonly normalized_label: string;
    /**
     * Optional user-configured display label. When set, the UI shows it
     * verbatim without any built-in shortening.
     */
    readonly display_label?: string;
    /**
     * @deprecated Use `normalized_label`. Retained as an alias while the
     * codebase migrates to the new three-layer label model.
     */
    readonly name?: string;
    readonly window: ObservationWindow;
    readonly used: number | null;
    readonly limit: number | null;
    readonly display_style: ObservationDisplayStyle;
    readonly reset_at: number | null;
    readonly status: ObservationStatus;
    readonly observed_at: number;
    readonly source: ObservationSource;
    readonly stale: boolean;
    readonly last_error: string | null;
}

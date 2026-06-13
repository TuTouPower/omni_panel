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
    readonly name: string;
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

/** User-controlled, read-only development panel scan settings. */
export interface DevPanelConfiguration {
    readonly scanRoots: readonly string[];
    /** Local calendar date, inclusive, in YYYY-MM-DD form. */
    readonly commitCutoff: string;
    readonly currentUserOnly: boolean;
}

export interface DevPanelAuthorSummary {
    readonly name: string;
    readonly email: string;
    readonly commits: number;
}

export interface DevPanelRepositorySummary {
    readonly repository: string;
    readonly path: string;
    readonly commits: number;
    readonly authors: readonly DevPanelAuthorSummary[];
    readonly committers: readonly DevPanelAuthorSummary[];
}

export interface DevPanelDailyRepositoryCount {
    readonly repository: string;
    readonly count: number;
}

export interface DevPanelDailySummary {
    readonly date: string;
    readonly count: number;
    readonly repositories: readonly DevPanelDailyRepositoryCount[];
}

export interface DevPanelScanError {
    readonly root: string;
    readonly path?: string;
    readonly message: string;
}

export interface DevPanelScanResult {
    readonly scan_id: string;
    readonly status: "completed" | "failed" | "cancelled";
    readonly scanned_at: string;
    readonly data_version: number;
    readonly timezone: string;
    readonly scan_roots: readonly string[];
    readonly cutoff: string;
    readonly current_user_only: boolean;
    readonly effective_current_user_only: boolean;
    readonly identity_warning?: string;
    readonly daily: readonly DevPanelDailySummary[];
    readonly repositories: readonly DevPanelRepositorySummary[];
    readonly errors: readonly DevPanelScanError[];
}

export interface DevPanelState {
    readonly status: "idle" | "running" | "completed" | "failed" | "cancelled";
    readonly scan_id: string | null;
    readonly started_at: string | null;
    readonly result: DevPanelScanResult | null;
    readonly error: string | null;
}

export interface DevPanelScanStart {
    readonly scan_id: string;
    readonly status: "running" | "completed" | "failed" | "cancelled";
    readonly reused: boolean;
}

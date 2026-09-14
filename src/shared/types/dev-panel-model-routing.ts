export const MODEL_ROUTING_SLOTS = [
    "default_model",
    "default_haiku",
    "default_sonnet",
    "default_opus",
    "default_vision",
] as const;

export interface DevPanelModelRoutingConfig {
    readonly config_path: string;
    readonly settings_path: string;
    readonly models: readonly string[];
    readonly aliases: Readonly<Record<string, readonly string[]>>;
    readonly expanded_slots: readonly string[];
    readonly settings_present: boolean;
}

export interface DevPanelModelRoutingChannel {
    readonly id: string;
    readonly name: string;
    readonly group: string;
    readonly status: string;
    readonly enabled: boolean;
    readonly models: readonly string[];
    readonly model_mapping: Readonly<Record<string, string>>;
    readonly priority: number | null;
}

export interface DevPanelModelRoutingChannels {
    readonly fetched_at: string;
    readonly channels: readonly DevPanelModelRoutingChannel[];
}

export interface DevPanelModelRoutingChange {
    readonly channel_id: string;
    readonly channel_name: string;
    readonly status: "success" | "failed" | "skipped";
    readonly added_models: readonly string[];
    readonly removed_models: readonly string[];
    readonly mapping_changes: readonly string[];
    readonly priority_changed: boolean;
    readonly error?: string;
}

export interface DevPanelModelRoutingSaveRequest {
    readonly selections: Readonly<Record<string, string>>;
    readonly confirmed: boolean;
}

export interface DevPanelModelRoutingSnapshotInfo {
    readonly snapshot_id: string;
    readonly created_at: string;
    readonly channel_count: number;
}

export interface DevPanelModelRoutingSaveResult {
    readonly success: boolean;
    readonly snapshot: DevPanelModelRoutingSnapshotInfo;
    readonly changes: readonly DevPanelModelRoutingChange[];
}

export interface DevPanelModelRoutingTestRequest {
    readonly slot: string;
    readonly model: string;
}

export interface DevPanelModelRoutingTestResult {
    readonly success: boolean;
    readonly model_name: string | null;
    readonly error: string | null;
}

export interface DevPanelModelRoutingSnapshot {
    readonly info: DevPanelModelRoutingSnapshotInfo;
    readonly channels: readonly {
        readonly channel_id: string;
        readonly channel_name: string;
        readonly models: readonly string[];
        readonly model_mapping: Readonly<Record<string, string>>;
        readonly priority: number | null;
    }[];
}

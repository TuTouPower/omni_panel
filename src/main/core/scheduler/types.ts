import type { UsageItem, PluginChart } from "../../../shared/schemas/plugin-output";

export interface SnapshotSuccess {
    readonly updatedAt: string;
    readonly items: readonly UsageItem[];
    readonly badge?: string;
    readonly chart?: PluginChart;
}

export type ConnectorSnapshotState =
    | { readonly status: "idle" }
    | { readonly status: "loading"; readonly lastSuccess?: SnapshotSuccess }
    | {
          readonly status: "ready";
          readonly items: readonly UsageItem[];
          readonly updatedAt: Date;
          readonly badge?: string;
          readonly chart?: PluginChart;
      }
    | {
          readonly status: "failed";
          readonly error: string;
          readonly lastSuccess?: SnapshotSuccess;
      };

export interface RuntimeStoreListener {
    onStateChange(instanceId: string, state: ConnectorSnapshotState): void;
}

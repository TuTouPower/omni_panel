import type { UsageItem, PluginChart } from "../../../shared/schemas/plugin-output";
import type { PluginCachedState } from "../cache/types";

export type PluginSnapshotState =
    | { readonly status: "idle" }
    | { readonly status: "loading" }
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
          readonly lastSuccess?: PluginCachedState;
      };

export interface RuntimeStoreListener {
    onStateChange(instanceId: string, state: PluginSnapshotState): void;
}

export interface SystemEventBus {
    onSleep(callback: () => void): void;
    onWake(callback: () => void): void;
}

import type { UsageItem, PluginChart } from "../../../shared/schemas/plugin-output";

export interface PluginCachedState {
    readonly updatedAt: string;
    readonly items: readonly UsageItem[];
    readonly badge?: string;
    readonly chart?: PluginChart;
}

import type { PluginMetadata } from "../../../shared/schemas/plugin-metadata";

export interface PluginDefinition {
    readonly scriptName: string;
    readonly executablePath: string;
    readonly metadata: PluginMetadata | null;
    readonly source: "bundled" | "user";
}

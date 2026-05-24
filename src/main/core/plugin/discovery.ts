import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePluginMetadata } from "./metadata-parser";
import type { PluginDefinition } from "./types";

const PLUGIN_EXT = ".py";
const COMMON_PREFIX = "_common";

export async function discoverPlugins(
    dir: string,
    source: "bundled" | "user" = "bundled",
): Promise<readonly PluginDefinition[]> {
    let entries: readonly string[];
    try {
        entries = await readdir(dir);
    } catch {
        return [];
    }

    const pluginFiles = entries.filter(
        (name) =>
            name.endsWith(PLUGIN_EXT) && !name.startsWith(COMMON_PREFIX) && !name.startsWith("."),
    );

    const definitions: PluginDefinition[] = [];

    for (const scriptName of pluginFiles) {
        const filePath = join(dir, scriptName);
        try {
            const content = await readFile(filePath, "utf8");
            const metadata = parsePluginMetadata(content);
            definitions.push({ scriptName, executablePath: filePath, metadata, source });
        } catch {
            definitions.push({ scriptName, executablePath: filePath, metadata: null, source });
        }
    }

    return definitions;
}

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parsePluginMetadata } from "./metadata-parser";
import type { PluginDefinition } from "./types";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("discovery");
const PLUGIN_EXT = ".ts";

export async function discoverPlugins(
    dir: string,
    source: "bundled" | "user" = "bundled",
): Promise<readonly PluginDefinition[]> {
    let entries: readonly string[];
    try {
        entries = await readdir(dir);
    } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
            log.warn(`Cannot read ${source} plugins dir ${dir}: ${String(err)}`);
        } else {
            log.debug(`${source} plugins dir not found: ${dir}`);
        }
        return [];
    }

    const pluginFiles = entries.filter(
        (name) => name.endsWith(PLUGIN_EXT) && !name.startsWith("."),
    );

    const definitions: PluginDefinition[] = [];

    for (const scriptName of pluginFiles) {
        const filePath = join(dir, scriptName);
        try {
            const content = await readFile(filePath, "utf8");
            const metadata = parsePluginMetadata(content);
            definitions.push({ scriptName, executablePath: filePath, metadata, source });
        } catch (err: unknown) {
            log.warn(`Failed to parse metadata for ${filePath}: ${String(err)}`);
            definitions.push({ scriptName, executablePath: filePath, metadata: null, source });
        }
    }

    return definitions;
}

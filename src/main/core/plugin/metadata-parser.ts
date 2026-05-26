import { METADATA_MAX_LINES } from "../../../shared/constants";
import { pluginMetadataSchema, type PluginMetadata } from "../../../shared/schemas/plugin-metadata";

function stripCommentPrefix(line: string): string {
    const slashIndex = line.indexOf("//");
    if (slashIndex === -1) return line;
    const afterSlash = line.slice(slashIndex + 2);
    if (afterSlash.startsWith(" ")) return afterSlash.slice(1);
    return afterSlash;
}

export function parsePluginMetadata(content: string): PluginMetadata | null {
    const lines = content.split("\n").slice(0, METADATA_MAX_LINES);

    let beginIndex = -1;
    let endIndex = -1;
    let firstLineContent = "";

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line === undefined) {
            continue;
        }

        const stripped = stripCommentPrefix(line).trim();
        if (stripped.startsWith("UsageBoardPlugin:") && beginIndex === -1) {
            beginIndex = i;
            firstLineContent = stripped.slice("UsageBoardPlugin:".length).trim();
            continue;
        }

        if (stripped.startsWith("/UsageBoardPlugin") && beginIndex !== -1) {
            endIndex = i;
            break;
        }
    }

    if (beginIndex === -1 || endIndex === -1) {
        return null;
    }

    const collected: string[] = [];
    if (firstLineContent) {
        collected.push(firstLineContent);
    }

    for (let i = beginIndex + 1; i < endIndex; i++) {
        const line = lines[i];
        if (line !== undefined) {
            collected.push(stripCommentPrefix(line));
        }
    }

    const jsonText = collected.join("\n");

    let parsed: unknown;
    try {
        parsed = JSON.parse(jsonText) as unknown;
    } catch {
        return null;
    }

    const result = pluginMetadataSchema.safeParse(parsed);
    if (!result.success) {
        return null;
    }

    return result.data;
}

import {
    pluginResultSchema,
    pluginSuccessOutputSchema,
    type PluginResult,
    type PluginSuccessOutput,
} from "../../../shared/schemas/plugin-output";
import { PluginOutputParseError, PluginSchemaError } from "../../../shared/errors/plugin-errors";

export function parsePluginResult(stdout: string): PluginResult {
    const trimmed = stdout.trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch {
        throw new PluginOutputParseError("Failed to parse plugin output as JSON", trimmed);
    }

    const result = pluginResultSchema.safeParse(parsed);
    if (!result.success) {
        throw new PluginSchemaError("Plugin output does not match schema", result.error.issues);
    }
    return result.data;
}

export function parsePluginSuccessOutput(stdout: string): PluginSuccessOutput {
    const trimmed = stdout.trim();
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch {
        throw new PluginOutputParseError("Failed to parse plugin output as JSON", trimmed);
    }
    const result = pluginSuccessOutputSchema.safeParse(parsed);
    if (!result.success) {
        throw new PluginSchemaError(
            "Plugin output does not match success schema",
            result.error.issues,
        );
    }
    return result.data;
}

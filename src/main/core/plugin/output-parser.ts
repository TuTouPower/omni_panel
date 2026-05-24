import {
    pluginErrorOutputSchema,
    pluginOutputSchema,
    type PluginErrorOutput,
    type PluginOutput,
} from "../../../shared/schemas/plugin-output";
import { PluginOutputParseError, PluginSchemaError } from "../../../shared/errors/plugin-errors";

export function parsePluginOutput(stdout: string): PluginOutput {
    const trimmed = stdout.trim();
    let parsed: unknown;

    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch {
        throw new PluginOutputParseError("Failed to parse plugin output as JSON", trimmed);
    }

    const result = pluginOutputSchema.safeParse(parsed);
    if (!result.success) {
        throw new PluginSchemaError("Plugin output does not match schema", result.error.issues);
    }

    return result.data;
}

export function parsePluginOutputOrError(stdout: string): PluginOutput | PluginErrorOutput {
    const trimmed = stdout.trim();
    let parsed: unknown;

    try {
        parsed = JSON.parse(trimmed) as unknown;
    } catch {
        throw new PluginOutputParseError("Failed to parse plugin output as JSON", trimmed);
    }

    const errorResult = pluginErrorOutputSchema.safeParse(parsed);
    if (errorResult.success) {
        return errorResult.data;
    }

    const outputResult = pluginOutputSchema.safeParse(parsed);
    if (outputResult.success) {
        return outputResult.data;
    }

    throw new PluginSchemaError("Plugin output does not match any known schema", [
        ...outputResult.error.issues,
    ]);
}

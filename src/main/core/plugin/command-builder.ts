export interface PluginCommand {
    readonly command: string;
    readonly args: readonly string[];
}

export function buildPluginCommand(
    _executablePath: string,
    _parameterValues: Record<string, string>,
    _language: string,
): PluginCommand {
    throw new Error("Not implemented");
}

import type { PluginCommand } from "./command-builder";

export interface PluginExecutionResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly durationMs: number;
}

export async function executePlugin(
    _command: PluginCommand,
    _options?: { readonly timeoutMs?: number },
): Promise<PluginExecutionResult> {
    throw new Error("Not implemented");
}

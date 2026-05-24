import type { PluginCommand } from "./command-builder";

export interface PluginExecutionResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly durationMs: number;
}

export function executePlugin(
    _command: PluginCommand,
    _options?: { readonly timeoutMs?: number },
): Promise<PluginExecutionResult> {
    void _command;
    void _options;
    return Promise.reject(new Error("Not implemented"));
}

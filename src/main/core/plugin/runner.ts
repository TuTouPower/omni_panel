import { spawn } from "node:child_process";
import type { PluginCommand } from "./command-builder";
import { PluginTimeoutError } from "../../../shared/errors/plugin-errors";
import { DEFAULT_TIMEOUT_MS } from "../../../shared/constants";

export interface PluginExecutionResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly durationMs: number;
}

export async function executePlugin(
    command: PluginCommand,
    options?: { readonly timeoutMs?: number },
): Promise<PluginExecutionResult> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    return new Promise<PluginExecutionResult>((resolve, reject) => {
        const child = spawn(command.command, [...command.args]);

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let exited = false;

        child.stdout.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
        });

        child.stderr.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
        });

        const timer = setTimeout(() => {
            child.kill("SIGTERM");
            const graceMs = 2000;
            const killTimer = setTimeout(() => {
                if (!exited) {
                    child.kill("SIGKILL");
                }
            }, graceMs);
            child.on("exit", () => {
                exited = true;
                clearTimeout(killTimer);
            });
            reject(new PluginTimeoutError(timeoutMs));
        }, timeoutMs);

        child.on("close", (code) => {
            exited = true;
            clearTimeout(timer);
            const durationMs = Date.now() - startTime;
            resolve({
                stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                stderr: Buffer.concat(stderrChunks).toString("utf8"),
                exitCode: code ?? -1,
                durationMs,
            });
        });

        child.on("error", (err) => {
            clearTimeout(timer);
            reject(err);
        });
    });
}

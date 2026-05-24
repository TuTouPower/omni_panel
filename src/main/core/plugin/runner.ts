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
        const child = spawn(command.command, [...command.args], {
            ...(command.env && { env: { ...process.env, ...command.env } }),
        });

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let timedOut = false;
        let settled = false;

        child.stdout.on("data", (chunk: Buffer) => {
            stdoutChunks.push(chunk);
        });

        child.stderr.on("data", (chunk: Buffer) => {
            stderrChunks.push(chunk);
        });

        const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGTERM");
            const graceMs = 2000;
            setTimeout(() => {
                if (!settled) {
                    child.kill("SIGKILL");
                }
            }, graceMs);
        }, timeoutMs);

        child.on("close", (code) => {
            settled = true;
            clearTimeout(timer);
            const durationMs = Date.now() - startTime;
            if (timedOut) {
                reject(new PluginTimeoutError(timeoutMs));
            } else {
                resolve({
                    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
                    stderr: Buffer.concat(stderrChunks).toString("utf8"),
                    exitCode: code ?? -1,
                    durationMs,
                });
            }
        });

        child.on("error", (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                reject(err);
            }
        });
    });
}

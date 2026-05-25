import { spawn } from "node:child_process";
import type { PluginCommand } from "./command-builder";
import { PluginTimeoutError } from "../../../shared/errors/plugin-errors";
import { DEFAULT_TIMEOUT_MS } from "../../../shared/constants";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("runner");

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

    // Log command without exposing secret values
    const safeArgs = command.args.map((a) => {
        if (a.startsWith("--usageboard-param")) return a;
        return a;
    });
    log.debug(`spawn: ${command.command} ${safeArgs.join(" ")}`);

    return new Promise<PluginExecutionResult>((resolve, reject) => {
        const child = spawn(command.command, [...command.args], {
            // nosemgrep: detect-child-process
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
            log.warn(
                `Process ${command.command} timed out after ${String(timeoutMs)}ms, sending SIGTERM`,
            );
            child.kill("SIGTERM");
            const graceMs = 2000;
            setTimeout(() => {
                if (!settled) {
                    log.error(
                        `Process ${command.command} did not exit after SIGTERM, sending SIGKILL`,
                    );
                    child.kill("SIGKILL");
                }
            }, graceMs);
        }, timeoutMs);

        child.on("close", (code) => {
            settled = true;
            clearTimeout(timer);
            const durationMs = Date.now() - startTime;
            const stdout = Buffer.concat(stdoutChunks).toString("utf8");
            const stderr = Buffer.concat(stderrChunks).toString("utf8");

            if (timedOut) {
                reject(new PluginTimeoutError(timeoutMs));
            } else {
                log.debug(
                    `exit ${String(code)} in ${String(durationMs)}ms, stdout=${String(stdout.length)}B stderr=${String(stderr.length)}B`,
                );
                if (stderr.length > 0) {
                    log.warn(`stderr: ${stderr.slice(0, 500)}`);
                }
                resolve({
                    stdout,
                    stderr,
                    exitCode: code ?? -1,
                    durationMs,
                });
            }
        });

        child.on("error", (err) => {
            if (!settled) {
                settled = true;
                clearTimeout(timer);
                log.error(`spawn error: ${command.command}`, err);
                reject(err);
            }
        });
    });
}

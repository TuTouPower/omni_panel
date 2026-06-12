import { spawn } from "node:child_process";
import type { PluginCommand } from "./command-builder";
import { PluginTimeoutError } from "../../../shared/errors/plugin-errors";
import { DEFAULT_TIMEOUT_MS } from "../../../shared/constants";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("runner");

function should_log_raw_debug(): boolean {
    return process.env["NODE_ENV"] === "development";
}

function redact_arg(arg: string): string {
    if (/^(?:[^=]*(?:key|token|secret|password)[^=]*)=/iu.test(arg)) {
        return `${arg.slice(0, arg.indexOf("=") + 1)}***`;
    }
    if (/^(?:sk-|key-|api[_-]?key)/iu.test(arg)) {
        return "***";
    }
    return arg;
}

export interface PluginExecutionResult {
    readonly stdout: string;
    readonly stderr: string;
    readonly exitCode: number;
    readonly durationMs: number;
}

const minimalEnv: Record<string, string> = {
    PATH: process.env["PATH"] ?? "",
    HOME: process.env["HOME"] ?? "",
    USERPROFILE: process.env["USERPROFILE"] ?? "",
    APPDATA: process.env["APPDATA"] ?? "",
    LOCALAPPDATA: process.env["LOCALAPPDATA"] ?? "",
    TEMP: process.env["TEMP"] ?? "",
    TMP: process.env["TMP"] ?? "",
    SYSTEMROOT: process.env["SYSTEMROOT"] ?? "",
    COMSPEC: process.env["COMSPEC"] ?? "",
};

const GRACE_MS = 2000;

function schedule_grace_kill(
    child: ReturnType<typeof spawn>,
    reason: string,
    settled: { value: boolean },
): ReturnType<typeof setTimeout> {
    return setTimeout(() => {
        if (!settled.value) {
            log.error(`${reason}, sending SIGKILL`);
            child.kill("SIGKILL");
        }
    }, GRACE_MS);
}

export async function executePlugin(
    command: PluginCommand,
    options?: { readonly timeoutMs?: number },
): Promise<PluginExecutionResult> {
    const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startTime = Date.now();

    const redacted_args = command.args.map(redact_arg);
    log.debug(`spawn: ${command.command} ${redacted_args.join(" ")}`);
    if (should_log_raw_debug()) {
        log.debug("plugin command raw", {
            command: command.command,
            args: redacted_args,
            env: command.env,
            stdinBytes: command.stdin?.length ?? 0,
            timeoutMs,
        });
    }

    return new Promise<PluginExecutionResult>((resolve, reject) => {
        const child = spawn(command.command, [...command.args], {
            // nosemgrep: detect-child-process
            env: {
                ...minimalEnv,
                ...command.env,
                ELECTRON_RUN_AS_NODE: "1",
            },
        });
        child.stdin.end(command.stdin ?? "");

        const stdoutChunks: Buffer[] = [];
        const stderrChunks: Buffer[] = [];
        let stdoutBytes = 0;
        let stderrBytes = 0;
        let stdoutStopped = false;
        let stderrStopped = false;
        let timedOut = false;
        const settled = { value: false };
        let graceTimer: ReturnType<typeof setTimeout> | null = null;

        function clearGraceTimer(): void {
            if (graceTimer !== null) {
                clearTimeout(graceTimer);
                graceTimer = null;
            }
        }

        child.stdout.on("data", (chunk: Buffer) => {
            if (stdoutStopped) return;
            stdoutChunks.push(chunk);
            stdoutBytes += chunk.length;
            if (stdoutBytes > 1024 * 1024) {
                stdoutStopped = true;
                log.warn("Plugin stdout exceeded 1MB, killing");
                child.kill("SIGTERM");
                clearGraceTimer();
                graceTimer = schedule_grace_kill(
                    child,
                    "Plugin did not exit after stdout SIGTERM",
                    settled,
                );
            }
        });

        child.stderr.on("data", (chunk: Buffer) => {
            if (stderrStopped) return;
            stderrChunks.push(chunk);
            stderrBytes += chunk.length;
            if (stderrBytes > 256 * 1024) {
                stderrStopped = true;
                log.warn("Plugin stderr exceeded 256KB, killing");
                child.kill("SIGTERM");
                clearGraceTimer();
                graceTimer = schedule_grace_kill(
                    child,
                    "Plugin did not exit after stderr SIGTERM",
                    settled,
                );
            }
        });

        const timer = setTimeout(() => {
            timedOut = true;
            log.warn(
                `Process ${command.command} timed out after ${String(timeoutMs)}ms, sending SIGTERM`,
            );
            child.kill("SIGTERM");
            clearGraceTimer();
            graceTimer = schedule_grace_kill(
                child,
                `Process ${command.command} did not exit after SIGTERM`,
                settled,
            );
        }, timeoutMs);

        child.on("close", (code) => {
            settled.value = true;
            clearGraceTimer();
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
                if (should_log_raw_debug()) {
                    log.debug("plugin stdout raw", { stdout });
                    log.debug("plugin stderr raw", { stderr });
                }
                if (stderr.length > 0) {
                    log.warn(`stderr received: ${String(stderr.length)}B`);
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
            if (!settled.value) {
                settled.value = true;
                clearGraceTimer();
                clearTimeout(timer);
                log.error(`spawn error: ${command.command}`, err);
                reject(err);
            }
        });
    });
}

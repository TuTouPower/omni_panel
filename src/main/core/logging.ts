import { appendFile, copyFile, mkdir, readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import {
    addTransport,
    createConsoleTransport,
    createFileTransport,
    createLogger,
    type LogLevel,
    setLogLevel,
} from "../../shared/lib/logger";
import { get_logs_dir } from "./paths";

const MAX_LOG_AGE_DAYS = 7;
const MAX_LOG_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
const MAX_SEGMENTS = 10;

export function getLogDir(userDataPath: string): string {
    return get_logs_dir(userDataPath);
}

function getLogFilePath(logDir: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return join(logDir, `app-${date}.log`);
}

async function getCurrentSegmentCount(logDir: string, logFile: string): Promise<number> {
    const base = basename(logFile);
    const prefix = base.replace(/\.log$/, ".");
    let max = 0;
    const files = await readdir(logDir).catch(() => []);
    for (const file of files) {
        if (!file.startsWith(prefix) || !file.endsWith(".log")) continue;
        const segmentStr = file.slice(prefix.length, -".log".length);
        const segmentNum = Number.parseInt(segmentStr, 10);
        if (!Number.isNaN(segmentNum) && segmentNum > max) {
            max = segmentNum;
        }
    }
    return max;
}

async function cleanupOldLogs(logDir: string): Promise<void> {
    try {
        const files = await readdir(logDir);
        const cutoff = Date.now() - MAX_LOG_AGE_DAYS * 24 * 60 * 60 * 1000;
        for (const file of files) {
            if (!file.endsWith(".log")) continue;
            const filePath = join(logDir, file);
            const s = await stat(filePath);
            if (s.mtimeMs < cutoff) {
                await unlink(filePath).catch(() => undefined);
            }
        }
    } catch {
        // Directory may not exist yet
    }
}

export function defaultLogLevelForEnv(env: NodeJS.ProcessEnv = process.env): LogLevel {
    return env["NODE_ENV"] === "production" ? "info" : "debug";
}

export async function exportCurrentLog(userDataPath: string, targetPath: string): Promise<void> {
    // Export the currently active log segment only. Historical segments are
    // named app-<date>.N.log and remain in the logs directory.
    const logFile = getLogFilePath(getLogDir(userDataPath));
    await copyFile(logFile, targetPath);
}

export async function initLogging(
    userDataPath: string,
    options: { logLevel?: LogLevel; maxLogFileBytes?: number; maxSegments?: number } = {},
): Promise<() => Promise<void>> {
    const logDir = getLogDir(userDataPath);
    await mkdir(logDir, { recursive: true });

    const logFile = getLogFilePath(logDir);
    const maxLogFileBytes = options.maxLogFileBytes ?? MAX_LOG_FILE_BYTES;
    const maxSegments = options.maxSegments ?? MAX_SEGMENTS;

    let currentSegment = await getCurrentSegmentCount(logDir, logFile);
    const size_warned_files = new Set<string>();
    let pending_write = Promise.resolve();

    setLogLevel(options.logLevel ?? defaultLogLevelForEnv());

    const removeFileTransport = addTransport(
        createFileTransport(
            (line) => {
                pending_write = pending_write.then(async () => {
                    try {
                        const s = await stat(logFile).catch(() => undefined);
                        if (s && s.size >= maxLogFileBytes) {
                            // The active file counts as one segment, so rotation is only
                            // allowed while the total would remain within the limit.
                            if (currentSegment >= maxSegments - 1) {
                                if (!size_warned_files.has(logFile)) {
                                    size_warned_files.add(logFile);
                                    createLogger("logging").warn(
                                        `Log file exceeded ${String(maxLogFileBytes / 1024 / 1024)}MB and reached the segment limit (${String(maxSegments)}), skipping further writes: ${logFile}`,
                                    );
                                }
                                return;
                            }
                            const nextSegment = currentSegment + 1;
                            const segmentPath = logFile.replace(
                                /\.log$/,
                                `.${String(nextSegment)}.log`,
                            );
                            await rename(logFile, segmentPath);
                            currentSegment = nextSegment;
                        }
                        await appendFile(logFile, line + "\n", "utf8");
                    } catch {
                        // Ignore write errors
                    }
                });
            },
            async () => {
                await pending_write;
            },
        ),
    );

    let removeConsoleTransport: (() => void) | undefined;
    if (process.env["NODE_ENV"] !== "production") {
        removeConsoleTransport = addTransport(createConsoleTransport());
    }

    createLogger("logging").info(`Logging initialized: ${logFile}`);

    const cleanup_promise = cleanupOldLogs(logDir);

    return async () => {
        await cleanup_promise;
        await pending_write;
        removeFileTransport();
        removeConsoleTransport?.();
    };
}

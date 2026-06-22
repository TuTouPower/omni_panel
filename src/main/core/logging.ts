import { appendFile, copyFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
    addTransport,
    createConsoleTransport,
    createFileTransport,
    createLogger,
    setLogLevel,
} from "../../shared/lib/logger";

const MAX_LOG_AGE_DAYS = 7;
const MAX_LOG_FILE_BYTES = 50 * 1024 * 1024; // 50 MB

export function getLogDir(userDataPath: string): string {
    return join(userDataPath, "logs");
}

function getLogFilePath(logDir: string): string {
    const date = new Date().toISOString().slice(0, 10);
    return join(logDir, `app-${date}.log`);
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

export async function exportCurrentLog(userDataPath: string, targetPath: string): Promise<void> {
    const logFile = getLogFilePath(getLogDir(userDataPath));
    await copyFile(logFile, targetPath);
}

export async function initLogging(userDataPath: string): Promise<() => void> {
    const logDir = getLogDir(userDataPath);
    await mkdir(logDir, { recursive: true });

    const logFile = getLogFilePath(logDir);

    const size_warned_files = new Set<string>();

    setLogLevel("debug");

    const removeFileTransport = addTransport(
        createFileTransport((line) => {
            void (async () => {
                try {
                    const s = await stat(logFile).catch(() => undefined);
                    if (s && s.size >= MAX_LOG_FILE_BYTES) {
                        if (!size_warned_files.has(logFile)) {
                            size_warned_files.add(logFile);
                            createLogger("logging").warn(
                                `Log file exceeded ${String(MAX_LOG_FILE_BYTES / 1024 / 1024)}MB, skipping further writes: ${logFile}`,
                            );
                        }
                        return;
                    }
                    await appendFile(logFile, line + "\n", "utf8");
                } catch {
                    // Ignore write errors
                }
            })();
        }),
    );

    let removeConsoleTransport: (() => void) | undefined;
    if (process.env["NODE_ENV"] !== "production") {
        removeConsoleTransport = addTransport(createConsoleTransport());
    }

    createLogger("logging").info(`Logging initialized: ${logFile}`);

    void cleanupOldLogs(logDir);

    return () => {
        removeFileTransport();
        removeConsoleTransport?.();
    };
}

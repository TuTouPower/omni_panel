import { appendFile, mkdir, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import {
    addTransport,
    createConsoleTransport,
    createFileTransport,
    createLogger,
    setLogLevel,
} from "../../shared/lib/logger";

const MAX_LOG_AGE_DAYS = 7;

function getLogDir(userDataPath: string): string {
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

export async function initLogging(userDataPath: string): Promise<() => void> {
    const logDir = getLogDir(userDataPath);
    await mkdir(logDir, { recursive: true });

    const logFile = getLogFilePath(logDir);

    setLogLevel("debug");

    const removeFileTransport = addTransport(
        createFileTransport((line) => {
            void appendFile(logFile, line + "\n", "utf8").catch(() => undefined);
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

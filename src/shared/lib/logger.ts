export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

interface LogTransport {
    write(level: LogLevel, module: string, message: string, meta?: unknown): void;
}

let globalLevel: LogLevel = "debug";
const transports: LogTransport[] = [];

export function setLogLevel(level: LogLevel): void {
    globalLevel = level;
}

export function addTransport(transport: LogTransport): void {
    transports.push(transport);
}

function formatTimestamp(): string {
    return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[globalLevel];
}

function emit(level: LogLevel, module: string, message: string, meta?: unknown): void {
    if (!shouldLog(level)) return;
    for (const t of transports) {
        t.write(level, module, message, meta);
    }
}

function formatMeta(meta: unknown): string {
    if (meta === undefined) return "";
    if (meta instanceof Error) return ` | ${meta.stack ?? meta.message}`;
    if (typeof meta === "string") return ` | ${meta}`;
    try {
        return ` | ${JSON.stringify(meta)}`;
    } catch {
        return ` | [unserializable]`;
    }
}

export function createConsoleTransport(): LogTransport {
    return {
        write(level, module, message, meta) {
            const line = `[${formatTimestamp()}] [${level.toUpperCase()}] [${module}] ${message}${formatMeta(meta)}`;
            try {
                if (level === "error") {
                    console.error(line);
                } else if (level === "warn") {
                    console.warn(line);
                } else {
                    console.log(line);
                }
            } catch {
                // Ignore EPIPE when stdout pipe is closed (e.g. in packaged app)
            }
        },
    };
}

export function createFileTransport(writeLine: (line: string) => void): LogTransport {
    return {
        write(level, module, message, meta) {
            const line = `[${formatTimestamp()}] [${level.toUpperCase()}] [${module}] ${message}${formatMeta(meta)}`;
            writeLine(line);
        },
    };
}

export interface Logger {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
}

export function createLogger(module: string): Logger {
    return {
        debug(message, meta) {
            emit("debug", module, message, meta);
        },
        info(message, meta) {
            emit("info", module, message, meta);
        },
        warn(message, meta) {
            emit("warn", module, message, meta);
        },
        error(message, meta) {
            emit("error", module, message, meta);
        },
    };
}

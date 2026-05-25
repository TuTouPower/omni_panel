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

export function createConsoleTransport(): LogTransport {
    return {
        write(level, module, message) {
            const line = `[${formatTimestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
            if (level === "error") {
                console.error(line);
            } else if (level === "warn") {
                console.warn(line);
            } else {
                console.log(line);
            }
        },
    };
}

export function createFileTransport(writeLine: (line: string) => void): LogTransport {
    return {
        write(level, module, message) {
            const line = `[${formatTimestamp()}] [${level.toUpperCase()}] [${module}] ${message}`;
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

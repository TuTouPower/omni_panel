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

export function addTransport(transport: LogTransport): () => void {
    transports.push(transport);
    return () => {
        const index = transports.indexOf(transport);
        if (index >= 0) {
            transports.splice(index, 1);
        }
    };
}

function formatTimestamp(): string {
    return new Date().toISOString();
}

function shouldLog(level: LogLevel): boolean {
    return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[globalLevel];
}

function serialize_meta(meta: unknown): unknown {
    const seen = new WeakSet<object>();

    function visit(value: unknown): unknown {
        if (value === undefined || value === null) return value;
        if (typeof value !== "object") return value;
        if (value instanceof Error) {
            return {
                name: value.name,
                message: value.message,
                stack: value.stack,
            };
        }
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
        try {
            if (Array.isArray(value)) return value.map((item) => visit(item));
            if (Object.getPrototypeOf(value) !== Object.prototype)
                return Object.prototype.toString.call(value);

            return Object.fromEntries(
                Object.entries(value as Record<string, unknown>).map(([key, item]) => [
                    key,
                    visit(item),
                ]),
            );
        } finally {
            seen.delete(value);
        }
    }

    return visit(meta);
}

function emit(level: LogLevel, module: string, message: string, meta?: unknown): void {
    if (!shouldLog(level)) return;
    const safe_meta = serialize_meta(meta);
    for (const t of transports) {
        t.write(level, module, message, safe_meta);
    }
}

function formatMeta(meta: unknown): string {
    if (meta === undefined) return "";
    if (typeof meta === "string") return ` | ${meta}`;
    try {
        return ` | ${JSON.stringify(meta)}`;
    } catch {
        return " | [unserializable]";
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

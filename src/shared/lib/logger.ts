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

const SENSITIVE_KEY = /authorization|password|passwd|secret|token|api[_-]?key|apikey|credential/i;

function redact_message(message: string): string {
    return message
        .replace(
            /\b(authorization|password|passwd|secret|token|api[_-]?key|apikey|credential)\s*[:=]\s*([^\s,;]+)/gi,
            "$1=***",
        )
        .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer ***");
}

function redact_meta(meta: unknown): unknown {
    if (meta === undefined || meta === null) return meta;
    if (typeof meta === "string") return redact_message(meta);
    if (typeof meta !== "object") return meta;
    if (meta instanceof Error) {
        const redacted = new Error(redact_message(meta.message));
        if (meta.stack) {
            redacted.stack = redact_message(meta.stack);
        }
        return redacted;
    }
    if (Array.isArray(meta)) return meta.map((item) => redact_meta(item));
    if (Object.getPrototypeOf(meta) !== Object.prototype) return meta;

    return Object.fromEntries(
        Object.entries(meta as Record<string, unknown>).map(([key, value]) => [
            key,
            SENSITIVE_KEY.test(key) ? "***" : redact_meta(value),
        ]),
    );
}

function emit(level: LogLevel, module: string, message: string, meta?: unknown): void {
    if (!shouldLog(level)) return;
    const safe_message = redact_message(message);
    const safe_meta = redact_meta(meta);
    for (const t of transports) {
        t.write(level, module, safe_message, safe_meta);
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

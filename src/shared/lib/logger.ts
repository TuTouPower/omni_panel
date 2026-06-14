export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const MIN_SCRUB_LENGTH = 4;
const MAX_SCRUB_VALUES = 10000;
const REPLACEMENT = "***";
const registered_values = new Set<string>();
let scrub_dirty = true;
let combined_pattern: RegExp | null = null;

function rebuild_pattern(): void {
    if (registered_values.size === 0) {
        combined_pattern = null;
    } else {
        const escaped = Array.from(registered_values).map((v) =>
            v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        );
        combined_pattern = new RegExp(escaped.join("|"), "g");
    }
    scrub_dirty = false;
}

export const scrubber = {
    register(value: string): void {
        if (value.length < MIN_SCRUB_LENGTH) return;
        if (registered_values.size >= MAX_SCRUB_VALUES) return;
        registered_values.add(value);
        scrub_dirty = true;
    },

    unregister(value: string): void {
        if (registered_values.delete(value)) {
            scrub_dirty = true;
        }
    },

    scrub_text(text: string): string {
        if (registered_values.size === 0) return text;
        if (scrub_dirty) rebuild_pattern();
        if (!combined_pattern) return text;
        combined_pattern.lastIndex = 0;
        return text.replace(combined_pattern, REPLACEMENT);
    },

    get_values(): ReadonlySet<string> {
        return registered_values;
    },

    clear(): void {
        registered_values.clear();
        scrub_dirty = true;
        combined_pattern = null;
    },
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
        if (value instanceof Date) return value.toISOString();
        if (seen.has(value)) return "[Circular]";
        seen.add(value);
        try {
            if (Array.isArray(value)) return value.map((item) => visit(item));
            if (value instanceof Map) {
                return Object.fromEntries(
                    Array.from(value.entries()).map(([key, item]) => [String(key), visit(item)]),
                );
            }
            if (value instanceof Set) return Array.from(value.values()).map((item) => visit(item));
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

function scrub_meta(meta: unknown): unknown {
    if (meta === undefined || meta === null) return meta;
    if (typeof meta === "string") return scrubber.scrub_text(meta);
    try {
        const raw = JSON.stringify(meta);
        return JSON.parse(scrubber.scrub_text(raw));
    } catch {
        return meta;
    }
}

function emit(level: LogLevel, module: string, message: string, meta?: unknown): void {
    if (!shouldLog(level)) return;
    const scrubbed_message = scrubber.scrub_text(message);
    const safe_meta = serialize_meta(meta);
    const scrubbed_meta = scrub_meta(safe_meta);
    for (const t of transports) {
        t.write(level, module, scrubbed_message, scrubbed_meta);
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

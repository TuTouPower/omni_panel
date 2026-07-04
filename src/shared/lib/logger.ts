export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogRecord {
    readonly ts: string;
    readonly level: LogLevel;
    readonly module: string;
    readonly message: string;
    readonly meta?: unknown;
    readonly trace_id?: string;
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
};

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error"]);
const MIN_SCRUB_LENGTH = 4;
const MAX_SCRUB_VALUES = 10000;
const REPLACEMENT = "***";
const SECRET_KEY_PATTERN =
    /(^|_|-|\b)(api[_-]?key|token|key|secret|password|cookie|authorization|credential|session)($|_|-|\b)/i;
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
    flush?(): Promise<void>;
}

let globalLevel: LogLevel = "debug";
const transports: LogTransport[] = [];

export function isLogLevel(value: unknown): value is LogLevel {
    return typeof value === "string" && LOG_LEVELS.has(value as LogLevel);
}

export function getLogLevel(): LogLevel {
    return globalLevel;
}

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

export async function flushLogTransports(): Promise<void> {
    await Promise.all(transports.map((transport) => transport.flush?.() ?? Promise.resolve()));
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
        if (typeof value === "bigint") return value.toString();
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

function redact_secret_keys(meta: unknown): unknown {
    if (meta === undefined || meta === null) return meta;
    if (typeof meta !== "object") return meta;
    if (Array.isArray(meta)) return meta.map((item) => redact_secret_keys(item));
    return Object.fromEntries(
        Object.entries(meta as Record<string, unknown>).map(([key, value]) => [
            key,
            SECRET_KEY_PATTERN.test(key) ? REPLACEMENT : redact_secret_keys(value),
        ]),
    );
}

function scrub_meta(meta: unknown): unknown {
    if (meta === undefined || meta === null) return meta;
    if (typeof meta === "string") return scrubber.scrub_text(meta);
    try {
        const redacted = redact_secret_keys(meta);
        const raw = JSON.stringify(redacted);
        return JSON.parse(scrubber.scrub_text(raw)) as unknown;
    } catch {
        return meta;
    }
}

function extract_trace_id(meta: unknown): string | undefined {
    if (meta === null || typeof meta !== "object") return undefined;
    const trace_id = (meta as Record<string, unknown>)["trace_id"];
    return typeof trace_id === "string" ? trace_id : undefined;
}

function emit(level: LogLevel, module: string, message: string, meta?: unknown): void {
    if (!shouldLog(level)) return;
    const scrubbed_message = scrubber.scrub_text(message);
    const safe_meta = serialize_meta(meta);
    const scrubbed_meta = scrub_meta(safe_meta);
    for (const transport of transports) {
        transport.write(level, module, scrubbed_message, scrubbed_meta);
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

function create_record(
    level: LogLevel,
    module: string,
    message: string,
    meta?: unknown,
): LogRecord {
    const trace_id = extract_trace_id(meta);
    return {
        ts: formatTimestamp(),
        level,
        module,
        message,
        ...(meta !== undefined && { meta }),
        ...(trace_id !== undefined && { trace_id }),
    };
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

// DESIGN: createFileTransport accepts a writeLine callback that may enqueue async
// I/O.  Call flushLogTransports before shutdown when the backing transport is
// flushable.
function safe_json_stringify(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return JSON.stringify("[Unserializable]");
    }
}

export function createFileTransport(
    writeLine: (line: string) => void,
    flush?: () => Promise<void>,
): LogTransport {
    return {
        write(level, module, message, meta) {
            writeLine(safe_json_stringify(create_record(level, module, message, meta)));
        },
        ...(flush ? { flush } : {}),
    };
}

export interface Logger {
    debug(message: string, meta?: unknown): void;
    info(message: string, meta?: unknown): void;
    warn(message: string, meta?: unknown): void;
    error(message: string, meta?: unknown): void;
}

export function createTraceId(prefix = "trace"): string {
    const random_part = Math.random().toString(36).slice(2, 8);
    return `${prefix}-${Date.now().toString(36)}-${random_part}`;
}

export function withLogContext(log: Logger, context: Record<string, unknown>): Logger {
    const merge_meta = (meta: unknown): unknown => {
        if (meta instanceof Error || meta instanceof Date) return { ...context, value: meta };
        if (meta !== null && typeof meta === "object" && !Array.isArray(meta)) {
            return { ...context, ...(meta as Record<string, unknown>) };
        }
        if (meta === undefined) return context;
        return { ...context, value: meta };
    };
    return {
        debug(message, meta) {
            log.debug(message, merge_meta(meta));
        },
        info(message, meta) {
            log.info(message, merge_meta(meta));
        },
        warn(message, meta) {
            log.warn(message, merge_meta(meta));
        },
        error(message, meta) {
            log.error(message, merge_meta(meta));
        },
    };
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

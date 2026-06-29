import { describe, expect, it, afterEach } from "vitest";
import {
    addTransport,
    createFileTransport,
    createLogger,
    flushLogTransports,
    scrubber,
    setLogLevel,
    withLogContext,
} from "../../../src/shared/lib/logger";

describe("logger", () => {
    afterEach(() => {
        scrubber.clear();
    });

    it("redacts registered secrets in debug output", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        // Register secrets with the scrubber so they get redacted
        scrubber.register("secret-token");
        scrubber.register("real-token");
        scrubber.register("real-password");

        try {
            const log = createLogger("test");
            log.debug("request api_key=secret-token", {
                Authorization: "Bearer real-token",
                nested: { password: "real-password" },
                safe: "visible",
            });

            const output = lines.join("\n");
            // Secrets should be replaced with "***"
            expect(output).not.toContain("secret-token");
            expect(output).not.toContain("real-token");
            expect(output).not.toContain("real-password");
            // Scrubbed placeholders should appear
            expect(output).toContain("***");
            // Non-secret values should remain visible
            expect(output).toContain("visible");
        } finally {
            remove_transport();
        }
    });

    it("serializes circular metadata without throwing", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const payload: Record<string, unknown> = { name: "root" };
            payload["self"] = payload;

            const log = createLogger("test");
            expect(() => {
                log.debug("circular", payload);
            }).not.toThrow();
            expect(lines.join("\n")).toContain("[Circular]");
        } finally {
            remove_transport();
        }
    });

    it("serializes repeated non-circular references as full values", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const shared = { name: "shared" };
            const payload = { first: shared, second: shared };

            const log = createLogger("test");
            log.debug("repeated", payload);

            const output = lines.join("\n");
            expect(output).toContain('"first":{"name":"shared"}');
            expect(output).toContain('"second":{"name":"shared"}');
            expect(output).not.toContain("[Circular]");
        } finally {
            remove_transport();
        }
    });

    it("serializes Date Map and Set metadata as raw JSON-compatible values", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const log = createLogger("test");
            log.debug("native values", {
                resetAt: new Date("2026-06-06T12:00:00.000Z"),
                headers: new Map<string, unknown>([["Authorization", "Bearer real-token"]]),
                providers: new Set(["claude", "codex"]),
            });

            const output = lines.join("\n");
            expect(output).toContain('"resetAt":"2026-06-06T12:00:00.000Z"');
            expect(output).toContain('"headers":{"Authorization":"***"}');
            expect(output).toContain('"providers":["claude","codex"]');
            expect(output).not.toContain("[object Date]");
            expect(output).not.toContain("[object Map]");
            expect(output).not.toContain("[object Set]");
        } finally {
            remove_transport();
        }
    });

    it("createFileTransport formats lines with timestamp, level, module, message, and meta", () => {
        const lines: string[] = [];
        const transport = createFileTransport((line) => lines.push(line));
        const remove_transport = addTransport(transport);
        setLogLevel("debug");

        try {
            const log = createLogger("my-module");
            log.info("hello world", { key: "value" });

            expect(lines).toHaveLength(1);
            const line = lines[0] ?? "";
            const record = JSON.parse(line) as Record<string, unknown>;
            const meta = record["meta"] as Record<string, unknown>;
            expect(record["ts"]).toEqual(expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/));
            expect(record["level"]).toBe("info");
            expect(record["module"]).toBe("my-module");
            expect(record["message"]).toBe("hello world");
            expect(meta["key"]).toBe("***");
        } finally {
            remove_transport();
        }
    });

    it("createFileTransport serializes unstringifiable metadata safely", () => {
        const lines: string[] = [];
        const transport = createFileTransport((line) => lines.push(line));
        const remove_transport = addTransport(transport);
        setLogLevel("debug");

        try {
            const log = createLogger("test");
            expect(() => {
                log.info("bigint", { count: 1n });
            }).not.toThrow();

            expect(JSON.parse(lines[0] ?? "{}") as Record<string, unknown>).toMatchObject({
                module: "test",
                message: "bigint",
            });
        } finally {
            remove_transport();
        }
    });

    it("createFileTransport propagates writeLine errors", () => {
        const transport = createFileTransport(() => {
            throw new Error("disk full");
        });
        const remove_transport = addTransport(transport);
        setLogLevel("debug");

        try {
            const log = createLogger("test");
            expect(() => {
                log.info("boom");
            }).toThrow("disk full");
        } finally {
            remove_transport();
        }
    });

    it("createFileTransport writes JSONL records with redacted secret metadata", () => {
        const lines: string[] = [];
        const transport = createFileTransport((line) => lines.push(line));
        const remove_transport = addTransport(transport);
        setLogLevel("debug");

        try {
            const log = createLogger("test");
            log.info("hello", {
                api_key: "sk-real",
                nested: { Authorization: "Bearer token-real" },
                safe: "visible",
            });

            const record = JSON.parse(lines[0] ?? "{}") as Record<string, unknown>;
            const meta = record["meta"] as Record<string, unknown>;
            const nested = meta["nested"] as Record<string, unknown>;
            expect(record["level"]).toBe("info");
            expect(record["module"]).toBe("test");
            expect(record["message"]).toBe("hello");
            expect(meta["api_key"]).toBe("***");
            expect(nested["Authorization"]).toBe("***");
            expect(meta["safe"]).toBe("visible");
        } finally {
            remove_transport();
        }
    });

    it("withLogContext preserves Error metadata under value", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const log = withLogContext(createLogger("test"), { trace_id: "trace-1" });
            log.error("failed", new Error("boom"));

            expect(lines.join("\n")).toContain('"trace_id":"trace-1"');
            expect(lines.join("\n")).toContain('"message":"boom"');
        } finally {
            remove_transport();
        }
    });

    it("flushLogTransports waits for flushable transports", async () => {
        const flushed: string[] = [];
        const remove_transport = addTransport({
            write() {
                return undefined;
            },
            flush() {
                flushed.push("done");
                return Promise.resolve();
            },
        });

        try {
            await flushLogTransports();
            expect(flushed).toEqual(["done"]);
        } finally {
            remove_transport();
        }
    });
});

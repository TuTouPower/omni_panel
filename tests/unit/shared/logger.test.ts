import { describe, expect, it, afterEach } from "vitest";
import {
    addTransport,
    createFileTransport,
    createLogger,
    scrubber,
    setLogLevel,
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
            expect(output).toContain('"headers":{"Authorization":"Bearer real-token"}');
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
            expect(line).toMatch(/^\[\d{4}-\d{2}-\d{2}T/);
            expect(line).toContain("[INFO]");
            expect(line).toContain("[my-module]");
            expect(line).toContain("hello world");
            expect(line).toContain('"key":"value"');
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
});

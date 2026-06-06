import { describe, expect, it } from "vitest";
import { addTransport, createLogger, setLogLevel } from "../../../src/shared/lib/logger";

describe("logger", () => {
    it("logs raw message and metadata values in debug mode", () => {
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            const log = createLogger("test");
            log.debug("request api_key=secret-token", {
                Authorization: "Bearer real-token",
                nested: { password: "real-password" },
                safe: "visible",
            });

            const output = lines.join("\n");
            expect(output).toContain("api_key=secret-token");
            expect(output).toContain('"Authorization":"Bearer real-token"');
            expect(output).toContain('"password":"real-password"');
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
});

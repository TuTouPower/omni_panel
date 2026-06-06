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
});

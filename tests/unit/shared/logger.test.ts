import { describe, expect, it } from "vitest";
import { addTransport, createLogger, setLogLevel } from "../../../src/shared/lib/logger";

describe("logger", () => {
    it("redacts secret-like fields in messages and metadata", () => {
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
            expect(output).toContain("api_key=***");
            expect(output).toContain('"Authorization":"***"');
            expect(output).toContain('"password":"***"');
            expect(output).toContain("visible");
            expect(output).not.toContain("secret-token");
            expect(output).not.toContain("real-token");
            expect(output).not.toContain("real-password");
        } finally {
            remove_transport();
        }
    });
});

import { describe, expect, it } from "vitest";
import { addTransport, setLogLevel } from "../../../src/shared/lib/logger";
import { handleRendererLog } from "../../../src/main/ipc/log-ipc";

describe("log-ipc", () => {
    it("persists renderer log metadata through the main logger in development", () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "development";
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            handleRendererLog({
                level: "debug",
                module: "renderer:usage-colors",
                message: "bar fill color raw",
                meta: {
                    reset_at: "2026-06-06T12:00:00Z",
                    elapsed: 0.6,
                    result: "var(--risk-yellow)",
                },
            });

            const output = lines.join("\n");
            expect(output).toContain("renderer:usage-colors");
            expect(output).toContain("bar fill color raw");
            expect(output).toContain('"reset_at":"2026-06-06T12:00:00Z"');
            expect(output).toContain('"elapsed":0.6');
            expect(output).toContain('"result":"var(--risk-yellow)"');
        } finally {
            remove_transport();
            setLogLevel("debug");
            process.env["NODE_ENV"] = original_node_env;
        }
    });

    it("returns ok without crashing when module is not a string", () => {
        const result = handleRendererLog({ level: "info", module: 42, message: "hello" });
        expect(result.ok).toBe(true);
    });

    it("returns ok without crashing when message is not a string", () => {
        const result = handleRendererLog({ level: "info", module: "test", message: null });
        expect(result.ok).toBe(true);
    });

    it("drops renderer log metadata outside development", () => {
        const original_node_env = process.env["NODE_ENV"];
        process.env["NODE_ENV"] = "production";
        const lines: string[] = [];
        const remove_transport = addTransport({
            write(level, module, message, meta) {
                lines.push(`${level}:${module}:${message}:${JSON.stringify(meta)}`);
            },
        });
        setLogLevel("debug");

        try {
            handleRendererLog({
                level: "debug",
                module: "usage-colors",
                message: "bar fill color raw",
                meta: { secret: "raw-secret" },
            });

            const output = lines.join("\n");
            expect(output).toContain("renderer:usage-colors");
            expect(output).toContain("bar fill color raw");
            expect(output).not.toContain("raw-secret");
        } finally {
            remove_transport();
            setLogLevel("debug");
            process.env["NODE_ENV"] = original_node_env;
        }
    });
});

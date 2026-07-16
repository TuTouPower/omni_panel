import { describe, it, expect, vi, beforeEach } from "vitest";
import { createLoggedIpcHandler } from "../../../src/main/ipc/logged";

function createMockLogger() {
    return {
        debug: vi.fn(),
        warn: vi.fn(),
    };
}

describe("createLoggedIpcHandler", () => {
    let logger: ReturnType<typeof createMockLogger>;
    let logged: ReturnType<typeof createLoggedIpcHandler>;
    const previous_node_env = process.env["NODE_ENV"];

    beforeEach(() => {
        logger = createMockLogger();
        logged = createLoggedIpcHandler(logger);
        vi.clearAllMocks();
    });

    it("calls the wrapped function and returns its result", async () => {
        const fn = vi.fn().mockResolvedValue({ ok: true, data: "result" });
        const result = await logged("test:channel", [], fn);
        expect(result).toEqual({ ok: true, data: "result" });
        expect(fn).toHaveBeenCalledOnce();
    });

    it("returns error result without throwing", async () => {
        const fn = vi.fn().mockResolvedValue({
            ok: false,
            error: { code: "VALIDATION_ERROR", message: "bad input" },
        });
        const result = await logged("test:channel", [], fn);
        expect(result.ok).toBe(false);
    });

    it("re-throws when the wrapped function throws", async () => {
        const fn = vi.fn().mockRejectedValue(new Error("crash"));
        await expect(logged("test:channel", [], fn)).rejects.toThrow("crash");
    });

    it("logs ok result with elapsed time", async () => {
        const fn = vi.fn().mockResolvedValue({ ok: true, data: null });
        await logged("test:channel", [], fn);
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining("test:channel ok"),
            expect.anything(),
        );
    });

    it("logs warning for failed result", async () => {
        const fn = vi.fn().mockResolvedValue({
            ok: false,
            error: { code: "ERROR", message: "fail" },
        });
        await logged("test:channel", [], fn);
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining("test:channel failed"),
            expect.anything(),
        );
    });

    it("uses redactArgs when provided", async () => {
        const redactArgs = vi.fn().mockReturnValue(["redacted"]);
        const loggedWithRedact = createLoggedIpcHandler(logger, { redactArgs });
        const fn = vi.fn().mockResolvedValue({ ok: true, data: null });

        process.env["NODE_ENV"] = "development";
        try {
            await loggedWithRedact("test:channel", ["sensitive"], fn);
            expect(redactArgs).toHaveBeenCalledWith(["sensitive"]);
            const debugCalls = logger.debug.mock.calls as [string, unknown?][];
            const rawLog = debugCalls.find(([msg]) => msg.includes("ipc request raw"));
            expect(rawLog).toBeDefined();
            const meta = rawLog?.[1] as Record<string, unknown> | undefined;
            expect(meta?.["args"]).toEqual(["redacted"]);
        } finally {
            if (previous_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = previous_node_env;
            }
        }
    });

    it("does not log raw payloads in production", async () => {
        process.env["NODE_ENV"] = "production";
        try {
            const fn = vi.fn().mockResolvedValue({ ok: true, data: null });
            await logged("test:channel", ["secret"], fn);
            const debugCalls = logger.debug.mock.calls as [string, unknown?][];
            const rawLog = debugCalls.find(([msg]) => msg.includes("ipc request raw"));
            expect(rawLog).toBeUndefined();
        } finally {
            if (previous_node_env === undefined) {
                delete process.env["NODE_ENV"];
            } else {
                process.env["NODE_ENV"] = previous_node_env;
            }
        }
    });

    it("includes trace_id in all log messages", async () => {
        const fn = vi.fn().mockResolvedValue({ ok: true, data: null });
        await logged("test:channel", [], fn);
        const allMetas = (logger.debug.mock.calls as [string, unknown?][]).map(([, meta]) => meta);
        for (const meta of allMetas) {
            expect(meta).toHaveProperty("trace_id");
            expect(typeof (meta as Record<string, unknown>)["trace_id"]).toBe("string");
        }
    });
});

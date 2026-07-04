import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLogLevelForEnv, initLogging } from "../../../src/main/core/logging";
import { createLogger } from "../../../src/shared/lib/logger";

let temp_dir: string | null = null;
let remove_logging: (() => void | Promise<void>) | null = null;

async function cleanup_logging(): Promise<void> {
    await remove_logging?.();
    remove_logging = null;
}

afterEach(async () => {
    await cleanup_logging();
    if (temp_dir) {
        await rm(temp_dir, { recursive: true, force: true });
        temp_dir = null;
    }
});

describe("initLogging", () => {
    it("writes the active log file path to the log", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-usage-logs-"));

        remove_logging = await initLogging(temp_dir);

        const log_dir = join(temp_dir, "logs");
        await vi.waitFor(async () => {
            const files = await readdir(log_dir);
            const log_file = files.find((file) => file.endsWith(".log"));
            expect(log_file).toBeDefined();
            const content = await readFile(join(log_dir, log_file ?? ""), "utf8");
            const record = JSON.parse(content.trim()) as Record<string, string>;
            expect(record["message"]).toContain("Logging initialized:");
            expect(record["message"]).toContain(log_dir);
        });
    });

    it("uses debug by default outside production and info in production", () => {
        expect(defaultLogLevelForEnv({ NODE_ENV: "development" })).toBe("debug");
        expect(defaultLogLevelForEnv({ NODE_ENV: "test" })).toBe("debug");
        expect(defaultLogLevelForEnv({ NODE_ENV: "production" })).toBe("info");
    });

    it("cleanup flushes queued file writes", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-usage-logs-"));

        remove_logging = await initLogging(temp_dir, { logLevel: "debug" });
        createLogger("test").info("queued");
        await cleanup_logging();

        const log_dir = join(temp_dir, "logs");
        const files = await readdir(log_dir);
        const log_file = files.find((file) => file.endsWith(".log"));
        expect(log_file).toBeDefined();
        const content = await readFile(join(log_dir, log_file ?? ""), "utf8");
        expect(content).toContain('"message":"queued"');
    });
});

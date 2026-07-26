import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLogLevelForEnv, initLogging } from "../../../src/main/core/logging";
import { createLogger } from "../../../src/shared/lib/logger";

const MAX_SEGMENTS = 3;

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
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));

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
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));

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

    it("rotates the active log when it exceeds the size limit (t154)", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));
        remove_logging = await initLogging(temp_dir, {
            logLevel: "debug",
            maxLogFileBytes: 250,
        });

        const log_dir = join(temp_dir, "logs");
        createLogger("test").info("first line that is long enough to roll over after the next one");
        createLogger("test").info("second line that pushes the file past the tiny limit");
        createLogger("test").info("third line after rotation");
        await cleanup_logging();

        const files = await readdir(log_dir);
        const current = files.find((f) => /^app-\d{4}-\d{2}-\d{2}\.log$/.test(f));
        const segment = files.find((f) => /^app-\d{4}-\d{2}-\d{2}\.1\.log$/.test(f));
        expect(current).toBeDefined();
        expect(segment).toBeDefined();

        const current_content = await readFile(join(log_dir, current ?? ""), "utf8");
        const segment_content = await readFile(join(log_dir, segment ?? ""), "utf8");
        expect(segment_content).toContain("first line");
        expect(current_content).toContain("third line");
    });

    it("increments segment numbers across rotations (t154)", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));
        remove_logging = await initLogging(temp_dir, {
            logLevel: "debug",
            maxLogFileBytes: 120,
            maxSegments: 10,
        });

        const log_dir = join(temp_dir, "logs");
        for (let i = 0; i < 6; i++) {
            createLogger("test").info(
                `line ${String(i)} with padding to exceed the small limit soon`,
            );
        }
        await cleanup_logging();

        const files = await readdir(log_dir);
        expect(files).toContainEqual(expect.stringMatching(/\.1\.log$/));
        expect(files).toContainEqual(expect.stringMatching(/\.2\.log$/));
    });

    it("stops writing and warns when the segment limit is reached (t154)", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));
        const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        remove_logging = await initLogging(temp_dir, {
            logLevel: "debug",
            maxLogFileBytes: 40,
            maxSegments: MAX_SEGMENTS,
        });

        const log_dir = join(temp_dir, "logs");
        const date = new Date().toISOString().slice(0, 10);
        // Write enough to fill current + MAX_SEGMENTS segments, then keep going.
        for (let i = 0; i < 40; i++) {
            createLogger("test").info(`filler line ${String(i)} padding padding padding`);
        }
        await cleanup_logging();

        const files = await readdir(log_dir);
        // MAX_SEGMENTS=3 means active + 2 rotated segments at most.
        expect(files).toContain(`app-${date}.1.log`);
        expect(files).toContain(`app-${date}.2.log`);
        expect(files).not.toContain(`app-${date}.3.log`);

        const current = files.find((f) => f === `app-${date}.log`);
        const current_stat = await stat(join(log_dir, current ?? ""));
        // After hitting the segment limit, the active file should not grow
        // much beyond the configured limit.
        expect(current_stat.size).toBeLessThanOrEqual(40 + 250);
        expect(warn_spy).toHaveBeenCalledWith(expect.stringContaining("segment limit"));

        warn_spy.mockRestore();
    });

    it("cleans up old segment files during cleanupOldLogs (t154)", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));
        const log_dir = join(temp_dir, "logs");
        await mkdir(log_dir, { recursive: true });

        const old_date = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const old_current = join(log_dir, `app-${old_date}.log`);
        const old_segment = join(log_dir, `app-${old_date}.1.log`);
        await writeFile(old_current, "old current\n", "utf8");
        await writeFile(old_segment, "old segment\n", "utf8");

        const old_time = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
        await utimes(old_current, old_time, old_time);
        await utimes(old_segment, old_time, old_time);

        remove_logging = await initLogging(temp_dir, { logLevel: "debug" });
        await cleanup_logging();

        const files = await readdir(log_dir);
        expect(files).not.toContain(`app-${old_date}.log`);
        expect(files).not.toContain(`app-${old_date}.1.log`);
    });
});

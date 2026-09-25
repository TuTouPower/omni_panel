import { mkdtemp, mkdir, readFile, readdir, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    defaultLogLevelForEnv,
    exportCurrentLog,
    initLogging,
    cleanupOldLogs,
    record_write_error,
    record_cleanup_error,
    reset_logging_error_stats_for_testing,
} from "../../../src/main/core/logging";
import { createLogger } from "../../../src/shared/lib/logger";
import { get_local_date_string } from "../../../src/shared/lib/local-time";

// t502: ESM 下直接 vi.mock 本地 helper 需 hoisted 模式；跨午夜用真实 Date 推进
//（local-time 纯函数取系统本地时区，CI 多时区均可通过）。
const local_date_mock = vi.hoisted(() => ({ date: "" }));
vi.mock(import("../../../src/shared/lib/local-time"), async (importOriginal) => {
    const actual = await importOriginal();
    return {
        ...actual,
        get_local_date_string: (d?: Date) =>
            local_date_mock.date || actual.get_local_date_string(d),
    };
});

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

    it("consoleOutput=false suppresses console transport (CLI 模式 stdout 干净)", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));
        const console_spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        try {
            remove_logging = await initLogging(temp_dir, { consoleOutput: false });
            createLogger("test").info("cli message");
            // flush：文件 transport 异步，等一拍确保 console 若挂着会触发。
            await new Promise((r) => setTimeout(r, 50));
            expect(console_spy).not.toHaveBeenCalled();
        } finally {
            console_spy.mockRestore();
        }
    });

    it("consoleOutput 默认挂 console transport（dev 刷终端）", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));
        const console_spy = vi.spyOn(console, "log").mockImplementation(() => undefined);

        try {
            remove_logging = await initLogging(temp_dir);
            createLogger("test").info("dev message");
            await new Promise((r) => setTimeout(r, 50));
            expect(console_spy).toHaveBeenCalled();
        } finally {
            console_spy.mockRestore();
        }
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
        const date = get_local_date_string();
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

        const old_date = get_local_date_string(new Date(Date.now() - 8 * 24 * 60 * 60 * 1000));
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

    it("rotates fd across local midnight and export syncs to new file (t502 AC-001/002)", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-"));
        const log_dir = join(temp_dir, "logs");
        local_date_mock.date = "2026-09-18";
        try {
            remove_logging = await initLogging(temp_dir, { logLevel: "debug" });
            createLogger("test").info("before-midnight-sentinel-t502");
            await vi.waitFor(async () => {
                const content = await readFile(join(log_dir, "app-2026-09-18.log"), "utf8");
                expect(content).toContain("before-midnight-sentinel-t502");
            });

            local_date_mock.date = "2026-09-19";
            createLogger("test").info("after-midnight-sentinel-t502");
            await cleanup_logging();

            const before = await readFile(join(log_dir, "app-2026-09-18.log"), "utf8");
            const after = await readFile(join(log_dir, "app-2026-09-19.log"), "utf8");
            expect(before).toContain("before-midnight-sentinel-t502");
            expect(before).not.toContain("after-midnight-sentinel-t502");
            expect(after).toContain("after-midnight-sentinel-t502");

            // exportCurrentLog 与写路径同走 mocked 本地日期，跨天后导出新文件非空。
            const target = join(temp_dir, "exported-t502.log");
            await exportCurrentLog(temp_dir, target);
            expect(await readFile(target, "utf8")).toContain("after-midnight-sentinel-t502");
        } finally {
            local_date_mock.date = "";
        }
    });

    it("AC-001: warns to console with throttling when log write fails", () => {
        reset_logging_error_stats_for_testing();
        const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            record_write_error(new Error("ENOSPC: no space left on device"));
            record_write_error(new Error("ENOSPC: no space left on device"));
            record_write_error(new Error("ENOSPC: no space left on device"));

            expect(warn_spy).toHaveBeenCalledTimes(1);
            expect(warn_spy).toHaveBeenCalledWith(
                expect.stringContaining("Failed to write log file (count=1): ENOSPC"),
            );
        } finally {
            warn_spy.mockRestore();
            reset_logging_error_stats_for_testing();
        }
    });

    it("AC-001: warns to console with throttling when log cleanup fails", () => {
        reset_logging_error_stats_for_testing();
        const warn_spy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
        try {
            record_cleanup_error(new Error("EACCES: permission denied"));
            record_cleanup_error(new Error("EACCES: permission denied"));

            expect(warn_spy).toHaveBeenCalledTimes(1);
            expect(warn_spy).toHaveBeenCalledWith(
                expect.stringContaining("Failed to cleanup old logs (count=1): EACCES"),
            );
        } finally {
            warn_spy.mockRestore();
            reset_logging_error_stats_for_testing();
        }
    });

    it("AC-002: exportCurrentLog returns empty without throwing when log directory or file is missing", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-empty-"));
        const target = join(temp_dir, "exported.log");

        const result = await exportCurrentLog(temp_dir, target);
        expect(result.exported).toBe(false);
        expect(result.empty).toBe(true);

        const s = await stat(target);
        expect(s.isFile()).toBe(true);
        expect(s.size).toBe(0);
    });

    it("AC-003: custom maxAgeDays cleans up logs according to configured threshold", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-quota-"));
        const log_dir = join(temp_dir, "logs");
        await mkdir(log_dir, { recursive: true });

        const four_days_ago = get_local_date_string(new Date(Date.now() - 4 * 24 * 60 * 60 * 1000));
        const four_day_file = join(log_dir, `app-${four_days_ago}.log`);
        await writeFile(four_day_file, "4-day-old log\n", "utf8");
        const four_day_time = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
        await utimes(four_day_file, four_day_time, four_day_time);

        await cleanupOldLogs(log_dir, 7);
        let files = await readdir(log_dir);
        expect(files).toContain(`app-${four_days_ago}.log`);

        await cleanupOldLogs(log_dir, 3);
        files = await readdir(log_dir);
        expect(files).not.toContain(`app-${four_days_ago}.log`);
    });

    it("AC-003: initLogging respects configured maxLogFileBytes and maxSegments from config", async () => {
        temp_dir = await mkdtemp(join(tmpdir(), "omni-panel-logs-config-"));
        remove_logging = await initLogging(temp_dir, {
            logLevel: "debug",
            maxLogFileBytes: 80,
            maxSegments: 2,
        });

        const log_dir = join(temp_dir, "logs");
        const date = get_local_date_string();
        for (let i = 0; i < 20; i++) {
            createLogger("test").info(`line ${String(i)} extra content to overflow`);
        }
        await cleanup_logging();

        const files = await readdir(log_dir);
        expect(files).toContain(`app-${date}.1.log`);
        expect(files).not.toContain(`app-${date}.2.log`);
    });
});

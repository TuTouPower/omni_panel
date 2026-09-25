import { copyFile, mkdir, open, readdir, rename, stat, unlink } from "node:fs/promises";
import { basename, join } from "node:path";
import {
    addTransport,
    createConsoleTransport,
    createFileTransport,
    createLogger,
    type LogLevel,
    setLogLevel,
} from "../../shared/lib/logger";
import { get_local_date_string } from "../../shared/lib/local-time";
import { get_logs_dir } from "./paths";

// A133: 日志保留配额默认值常量收敛
export const DEFAULT_MAX_LOG_AGE_DAYS = 7;
export const DEFAULT_MAX_LOG_FILE_BYTES = 50 * 1024 * 1024; // 50 MB
export const DEFAULT_MAX_SEGMENTS = 10;

// A35 / AC-001: 错误节流记录，避免写/清理异常时刷屏与递归触发日志自增殖
let write_error_count = 0;
let last_write_warn_time = 0;
const WRITE_WARN_INTERVAL_MS = 5000;

export function record_write_error(err: unknown): void {
    write_error_count += 1;
    const now = Date.now();
    if (now - last_write_warn_time >= WRITE_WARN_INTERVAL_MS) {
        last_write_warn_time = now;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
            `[logging] Failed to write log file (count=${String(write_error_count)}): ${msg}`,
        );
    }
}

let cleanup_error_count = 0;
let last_cleanup_warn_time = 0;
const CLEANUP_WARN_INTERVAL_MS = 5000;

export function record_cleanup_error(err: unknown): void {
    cleanup_error_count += 1;
    const now = Date.now();
    if (now - last_cleanup_warn_time >= CLEANUP_WARN_INTERVAL_MS) {
        last_cleanup_warn_time = now;
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(
            `[logging] Failed to cleanup old logs (count=${String(cleanup_error_count)}): ${msg}`,
        );
    }
}

export function reset_logging_error_stats_for_testing(): void {
    write_error_count = 0;
    last_write_warn_time = 0;
    cleanup_error_count = 0;
    last_cleanup_warn_time = 0;
}

export function getLogDir(userDataPath: string): string {
    return get_logs_dir(userDataPath);
}

function getLogFilePath(logDir: string): string {
    return join(logDir, `app-${get_local_date_string()}.log`);
}

async function getCurrentSegmentCount(logDir: string, logFile: string): Promise<number> {
    const base = basename(logFile);
    const prefix = base.replace(/\.log$/, ".");
    let max = 0;
    const files = await readdir(logDir).catch(() => []);
    for (const file of files) {
        if (!file.startsWith(prefix) || !file.endsWith(".log")) continue;
        const segmentStr = file.slice(prefix.length, -".log".length);
        const segmentNum = Number.parseInt(segmentStr, 10);
        if (!Number.isNaN(segmentNum) && segmentNum > max) {
            max = segmentNum;
        }
    }
    return max;
}

export async function cleanupOldLogs(
    logDir: string,
    maxAgeDays = DEFAULT_MAX_LOG_AGE_DAYS,
): Promise<void> {
    try {
        const files = await readdir(logDir);
        const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
        for (const file of files) {
            if (!file.endsWith(".log")) continue;
            const filePath = join(logDir, file);
            const s = await stat(filePath);
            if (s.mtimeMs < cutoff) {
                await unlink(filePath).catch((err: unknown) => {
                    record_cleanup_error(err);
                });
            }
        }
    } catch (err: unknown) {
        if (
            typeof err === "object" &&
            err !== null &&
            "code" in err &&
            (err as { code: string }).code === "ENOENT"
        ) {
            // Directory may not exist yet
            return;
        }
        record_cleanup_error(err);
    }
}

export function defaultLogLevelForEnv(env: NodeJS.ProcessEnv = process.env): LogLevel {
    return env["NODE_ENV"] === "production" ? "info" : "debug";
}

export interface ExportLogResult {
    exported: boolean;
    empty: boolean;
}

export async function exportCurrentLog(
    userDataPath: string,
    targetPath: string,
): Promise<ExportLogResult> {
    // Export the currently active log segment only. Historical segments are
    // named app-<date>.N.log and remain in the logs directory.
    // t502 AC-002: 与写路径同一本地日期文件严格同步（均经 get_local_date_string）。
    const logFile = getLogFilePath(getLogDir(userDataPath));
    const exists = await stat(logFile)
        .then((s) => s.isFile() && s.size > 0)
        .catch(() => false);
    if (!exists) {
        // A36 / AC-002: 源文件缺失或为空时，写入空文件并返回明确结果，杜绝裸抛 ENOENT
        await open(targetPath, "w")
            .then((fd) => fd.close())
            .catch(() => undefined);
        return { exported: false, empty: true };
    }
    await copyFile(logFile, targetPath);
    return { exported: true, empty: false };
}

export async function initLogging(
    userDataPath: string,
    options: {
        logLevel?: LogLevel | undefined;
        maxAgeDays?: number | undefined;
        maxLogFileBytes?: number | undefined;
        maxSegments?: number | undefined;
        /** 是否把日志同时输出到 stdout（开发默认 true；CLI 模式 false 保持 stdout 干净）。 */
        consoleOutput?: boolean | undefined;
    } = {},
): Promise<() => Promise<void>> {
    const logDir = getLogDir(userDataPath);
    await mkdir(logDir, { recursive: true });

    const logFile = getLogFilePath(logDir);
    const maxLogFileBytes = options.maxLogFileBytes ?? DEFAULT_MAX_LOG_FILE_BYTES;
    const maxSegments = options.maxSegments ?? DEFAULT_MAX_SEGMENTS;
    const maxAgeDays = options.maxAgeDays ?? DEFAULT_MAX_LOG_AGE_DAYS;

    let currentSegment = await getCurrentSegmentCount(logDir, logFile);
    // t502: 常驻进程跨午夜写时轮转——跟踪当前活跃日期与文件，写时比对本地日期。
    let current_log_file = logFile;
    let current_log_date = get_local_date_string();
    let log_fd: Awaited<ReturnType<typeof open>> | null = null;
    let cached_size = 0;
    let writes_since_stat = 0;
    let writes_since_segment_warn = 0;
    let segment_warn_issued = false;
    // t376 AC-001: size 检查不再每条 stat——缓存字节累计，每 SIZE_STAT_INTERVAL
    // 条校准一次（fd 持久复用，eliminate 每日志 open/write/close）。
    const SIZE_STAT_INTERVAL = 32;
    // t376 AC-002: 段数达上限后不再静默跳过——每 SEGMENT_WARN_INTERVAL 条周期性
    // 重新 warn，持续错误期间诊断信息不丢。
    const SEGMENT_WARN_INTERVAL = 100;
    let pending_write = Promise.resolve();

    async function ensure_log_fd(): Promise<NonNullable<typeof log_fd>> {
        if (log_fd) return log_fd;
        log_fd = await open(current_log_file, "a");
        const s = await log_fd.stat();
        cached_size = s.size;
        writes_since_stat = 0;
        return log_fd;
    }

    async function close_log_fd(): Promise<void> {
        if (log_fd) {
            await log_fd.close().catch(() => undefined);
            log_fd = null;
        }
    }

    // t502 AC-001: 写时跨天检测——本地日期变化时关闭旧 fd 并切换到新一天文件。
    async function rotate_if_date_changed(): Promise<void> {
        const today = get_local_date_string();
        if (today === current_log_date) return;
        await close_log_fd();
        current_log_file = getLogFilePath(logDir);
        current_log_date = today;
        currentSegment = await getCurrentSegmentCount(logDir, current_log_file);
        cached_size = 0;
        writes_since_stat = 0;
        writes_since_segment_warn = 0;
        segment_warn_issued = false;
    }

    setLogLevel(options.logLevel ?? defaultLogLevelForEnv());

    const removeFileTransport = addTransport(
        createFileTransport(
            (line) => {
                const payload = line + "\n";
                pending_write = pending_write.then(async () => {
                    try {
                        await rotate_if_date_changed();
                        const fd = await ensure_log_fd();
                        if (writes_since_stat >= SIZE_STAT_INTERVAL) {
                            const s = await stat(current_log_file).catch(() => undefined);
                            if (s) {
                                cached_size = s.size;
                            } else {
                                // t376 AC-002/AC-001: stat 失败（文件被外部删除）时
                                // 关 fd 下次重开、缓存回落，避免永久 skip。
                                await close_log_fd();
                                cached_size = 0;
                            }
                            writes_since_stat = 0;
                        } else {
                            writes_since_stat += 1;
                        }
                        if (cached_size >= maxLogFileBytes) {
                            // The active file counts as one segment, so rotation is only
                            // allowed while the total would remain within the limit.
                            if (currentSegment >= maxSegments - 1) {
                                // t376 AC-002: 首次达上限立即 warn，之后每
                                // SEGMENT_WARN_INTERVAL 条重新 warn，不静默丢失诊断。
                                writes_since_segment_warn += 1;
                                if (
                                    !segment_warn_issued ||
                                    writes_since_segment_warn >= SEGMENT_WARN_INTERVAL
                                ) {
                                    segment_warn_issued = true;
                                    writes_since_segment_warn = 0;
                                    // 日志文件已满无处落盘；经 createLogger 会再次进
                                    // file transport 写路径 → skip→warn 递归自增殖，
                                    // 直接 console 输出诊断。
                                    console.warn(
                                        `[logging] Log file exceeded ${String(maxLogFileBytes / 1024 / 1024)}MB and reached the segment limit (${String(maxSegments)}), skipping further writes: ${current_log_file}`,
                                    );
                                }
                                return;
                            }
                            await close_log_fd();
                            const nextSegment = currentSegment + 1;
                            const segmentPath = current_log_file.replace(
                                /\.log$/,
                                `.${String(nextSegment)}.log`,
                            );
                            await rename(current_log_file, segmentPath);
                            currentSegment = nextSegment;
                            // t376 AC-002: rotate 后段限解除，重置首标记——再次写满
                            // 达上限时首次 skip 立即 warn（否则等 100 条才诊断）。
                            segment_warn_issued = false;
                            writes_since_segment_warn = 0;
                            const rotated_fd = await ensure_log_fd();
                            cached_size = 0;
                            await rotated_fd.write(payload);
                            cached_size += Buffer.byteLength(payload);
                            return;
                        }
                        await fd.write(payload);
                        cached_size += Buffer.byteLength(payload);
                    } catch (err: unknown) {
                        // A35 / AC-001: 写错误不静默吞，记录告警与节流保护
                        record_write_error(err);
                        // 写错误忽略；fd 可能失效（如磁盘满后重试），close 后下次重开，
                        // 避免持续失败下每次泄漏一个 OS fd。
                        await close_log_fd();
                    }
                });
            },
            async () => {
                await pending_write;
                await log_fd?.sync().catch(() => undefined);
            },
        ),
    );

    let removeConsoleTransport: (() => void) | undefined;
    const console_output = options.consoleOutput ?? process.env["NODE_ENV"] !== "production";
    if (console_output) {
        removeConsoleTransport = addTransport(createConsoleTransport());
    }

    createLogger("logging").info(`Logging initialized: ${logFile}`);

    const cleanup_promise = cleanupOldLogs(logDir, maxAgeDays);

    return async () => {
        await cleanup_promise;
        await pending_write;
        removeFileTransport();
        removeConsoleTransport?.();
        await close_log_fd();
    };
}

import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("observation-retention");

export const DEFAULT_RETENTION_DAYS = 90;
export const ROW_SIZE_BYTES = 512;

/**
 * 计算留存阈值（ms）与行数预算（t343）：
 * - cacheMaxMb 为 undefined/0（不限制）→ 用固定日期阈值 DEFAULT_RETENTION_DAYS。
 * - cacheMaxMb > 0 → 行数预算 = cacheMaxMb * MB / ROW_SIZE_BYTES；
 *   与日期阈值取小，兼顾「磁盘上限」与「趋势窗口下限」。
 * 返回 null 表示无需按行数额外收紧（仅日期阈值即可）。
 */
export function retention_params(
    cache_max_mb: number | undefined,
    now_ms: number,
): { older_than_ms: number; max_rows: number | null } {
    const older_than_ms = now_ms - DEFAULT_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    if (!cache_max_mb || cache_max_mb <= 0) return { older_than_ms, max_rows: null };
    const max_rows = Math.max(1, Math.floor((cache_max_mb * 1024 * 1024) / ROW_SIZE_BYTES));
    return { older_than_ms, max_rows };
}

/**
 * 执行一次留存清理（t343）：按日期阈值 prune，若行数预算非空且超预算，
 * 追加按时间提前 prune 至行数回落预算内。
 * 返回清理行数（首次 prune + 预算收紧追加）。
 */
export function run_retention_prune(
    deps: {
        prune(older_than_ms: number): number;
        count_observations(): number;
    },
    cache_max_mb: number | undefined,
    now_ms: number,
): number {
    const { older_than_ms, max_rows } = retention_params(cache_max_mb, now_ms);
    let removed = deps.prune(older_than_ms);

    if (max_rows !== null) {
        let count = deps.count_observations();
        // A34 / AC-006: 限制最大迭代轮次 (10轮)，自适应时间步长，避免极小 cacheMaxMb 时逐天 prune 90 轮阻塞主线程
        let cutoff = older_than_ms;
        let iterations = 0;
        const max_iterations = 10;
        while (count > max_rows && cutoff < now_ms && iterations < max_iterations) {
            iterations++;
            const remaining_iters = max_iterations - iterations + 1;
            const step_ms = Math.max(
                24 * 60 * 60 * 1000,
                Math.floor((now_ms - cutoff) / remaining_iters),
            );
            cutoff += step_ms;
            removed += deps.prune(cutoff);
            count = deps.count_observations();
        }
    }

    if (removed > 0) {
        log.info(
            `observation retention: pruned ${String(removed)} rows (cacheMaxMb=${String(cache_max_mb ?? "unset")})`,
        );
    }
    return removed;
}

export const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

export interface RetentionScheduler {
    run_now(): void;
    start(): void;
    stop(): void;
}

/**
 * 留存定时器接线（t343，testable wiring）：启动即执行一次，之后每 24h 定时。
 * cacheMaxMb 经 get_cache_max_mb 动态读取（config 保存后立即生效）。
 * 提取为可注入模块便于集成测试断言「启动执行 + 每日触发 + stop 清理」。
 */
export function create_retention_scheduler(deps: {
    prune(older_than_ms: number): number;
    count_observations(): number;
    get_cache_max_mb(): number | undefined;
    now(): number;
}): RetentionScheduler {
    let timer: ReturnType<typeof setInterval> | null = null;

    const run_now = (): void => {
        try {
            run_retention_prune(deps, deps.get_cache_max_mb(), deps.now());
        } catch (error) {
            log.error(
                `observation retention prune failed: ${
                    error instanceof Error ? error.message : String(error)
                }`,
            );
        }
    };

    return {
        run_now,
        start() {
            run_now();
            if (timer === null) {
                timer = setInterval(run_now, RETENTION_INTERVAL_MS);
                timer.unref();
            }
        },
        stop() {
            if (timer !== null) {
                clearInterval(timer);
                timer = null;
            }
        },
    };
}

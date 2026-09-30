import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { app } from "electron";
import {
    createLogger,
    flushLogTransports,
    has_log_transports,
    is_log_level_enabled,
} from "../../shared/lib/logger";
import { format_local_iso } from "../../shared/lib/local-time";
import { getCurrentLogFilePath } from "./logging";
import { getDataRoot } from "./paths";

const log = createLogger("quit-source");

/**
 * t536 AC-001：应用内全部显式退出入口（`app.quit()` / `app.exit()`）的来源目录。
 * 每处出口必须经本漏斗记录来源后才触发退出；eslint `no-restricted-properties`
 * 禁止在 `src/` 其余位置直接调用 `app.quit` / `app.exit`。新增退出入口时同步
 * 在此登记并保持 `docs/blueprint/architecture.md` 的入口清单一致。
 */
export const QUIT_SOURCES = [
    "cli.help",
    "cli.export",
    "cli.control",
    "control-api.restart",
    "control-api.quit",
    "tray.quit",
    "tray.restart",
    "will-quit.flush-retry",
    "startup.cli-failure",
    "startup.failure",
    "menu.cmd-q",
    "single-instance.lock-lost",
] as const;

export type QuitSource = (typeof QUIT_SOURCES)[number];

export interface QuitRequestRecord {
    readonly source: QuitSource;
    readonly action: "quit" | "exit";
    readonly exit_code?: number;
    readonly trace_id: string;
}

let trace_id: string | null = null;
let requests: QuitRequestRecord[] = [];

function record(
    source: QuitSource,
    action: "quit" | "exit",
    exit_code?: number,
): QuitRequestRecord {
    // 同一进程的退出序列共享一个 trace：首个请求生成，后续入口（如
    // will-quit flush 重入）复用，日志按 trace 串起「谁请求 → 清理 → 结束」。
    trace_id ??= randomUUID();
    const entry: QuitRequestRecord = {
        source,
        action,
        ...(exit_code !== undefined ? { exit_code } : {}),
        trace_id,
    };
    requests.push(entry);
    const message = `Exit requested: source=${source} action=${action}${
        exit_code !== undefined ? ` exit_code=${String(exit_code)}` : ""
    }`;
    log.info(message, entry);
    // transport 缺失（初始化前 / will-quit 清理后）或 info 被 logLevel 过滤时，
    // log.info 实际无输出——同步兜底保证来源行总能落盘。
    if (!has_log_transports() || !is_log_level_enabled("info")) {
        persist_log_line("quit-source", message, { ...entry });
    }
    return entry;
}

/**
 * transport 不可用或级别过滤时的同步兜底：日志初始化前的早期出口（cli.help/
 * export/control、单实例锁竞争、初始化完成前的启动失败）、will-quit 已把
 * transport 清掉后的 flush 重入、logLevel 高于 info 的配置——`log.info` 均无
 * 输出，同步追加到同一活动日志文件，保证 AC-001 的来源行在任何出口都可落盘。
 * 失败不阻塞退出（退出链路优先）。
 */
function persist_log_line(
    module_name: string,
    message: string,
    meta: Record<string, unknown>,
): void {
    try {
        const file_path = getCurrentLogFilePath(getDataRoot());
        mkdirSync(dirname(file_path), { recursive: true });
        const trace = typeof meta["trace_id"] === "string" ? meta["trace_id"] : undefined;
        appendFileSync(
            file_path,
            `${JSON.stringify({
                ts: format_local_iso(),
                level: "info",
                module: module_name,
                message,
                meta,
                ...(trace !== undefined ? { trace_id: trace } : {}),
            })}\n`,
        );
    } catch (error) {
        // 已无其它日志通道；兜底失败不能反过来阻塞退出，只留 stderr 告警。
        console.warn(`[quit-source] fallback persist failed: ${String(error)}`);
    }
}

export function request_app_quit(source: QuitSource): void {
    record(source, "quit");
    app.quit();
}

export async function request_app_exit(source: QuitSource, exit_code: number): Promise<void> {
    record(source, "exit", exit_code);
    // app.exit() 立即终止进程：先 flush 异步 file transport 的 pending_write，
    // 否则本条来源记录与之前日志可能来不及落盘。
    await flushLogTransports();
    app.exit(exit_code);
}

export function get_quit_trace_id(): string | null {
    return trace_id;
}

export function get_quit_requester(): QuitSource | null {
    return requests[0]?.source ?? null;
}

export function get_quit_requests(): readonly QuitRequestRecord[] {
    return requests;
}

/**
 * t536 AC-001：`before-quit` 关停行的 meta——退出请求方 + 同一 trace。
 * 漏斗外触发（系统会话结束等）标 `untracked`；无可 trace 时不带 `trace_id` 字段。
 */
export function get_shutdown_log_meta(): { exit_source: string; trace_id?: string } {
    const trace = get_quit_trace_id();
    return {
        exit_source: get_quit_requester() ?? "untracked",
        ...(trace !== null ? { trace_id: trace } : {}),
    };
}

const shutdown_log = createLogger("main");

/**
 * t536 AC-001：`before-quit` 关停行统一出口。transport 缺失或被 logLevel
 * 过滤时同样走同步兜底，保证「谁请求退出 → 关停」两段日志总能同 trace 落盘。
 * module 保持 `main`（与 index.ts 既有关停行同模块名，grep 口径不变）。
 */
export function log_application_shutdown(): void {
    const message = "Application shutting down";
    const meta = get_shutdown_log_meta();
    shutdown_log.info(message, meta);
    if (!has_log_transports() || !is_log_level_enabled("info")) {
        persist_log_line("main", message, { ...meta });
    }
}

export function reset_quit_source_state_for_testing(): void {
    trace_id = null;
    requests = [];
}

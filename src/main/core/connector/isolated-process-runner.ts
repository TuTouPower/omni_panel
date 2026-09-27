import { utilityProcess, type UtilityProcess } from "electron";
import { fork, type ChildProcess, type Serializable } from "node:child_process";
import * as fs from "node:fs";
import { join, resolve } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import { DEFAULT_EXECUTION_BUDGET_MS } from "../../../shared/constants";
import {
    create_execution_budget,
    create_execution_budget_from_deadline,
    HARD_WATCHDOG_GRACE_MS,
    type ExecutionBudget,
} from "./execution-budget";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { ConnectorRunResult } from "./runtime";
import type { WorkerTaskPayload, WorkerResponsePayload } from "./worker/connector-worker-entry";

const log = createLogger("isolated-connector-runner");

export interface RunIsolatedOptions {
    readonly manifest: Manifest;
    readonly script_code: string;
    readonly compiled_code?: string | undefined;
    readonly budget?: ExecutionBudget | undefined;
    readonly deadline_ms?: number | undefined;
    readonly total_ms?: number | undefined;
    readonly timeout_ms?: number | undefined;
    readonly generation?: number | undefined;
    readonly params?: Record<string, string> | undefined;
    readonly instance_id?: string | undefined;
    readonly proxy_url?: string | undefined;
    readonly endpoint_overrides?: Record<string, string> | undefined;
    /** 测试用：可选指定自定义 worker 入口文件路径 */
    readonly worker_entry_path?: string | undefined;
}

/**
 * 解析连接器隔离子进程 worker 入口文件路径。
 * 生产/打包态优先使用 app.asar 内的编译产物 out/main/connector-worker.js（由 utilityProcess 加载可透明访问 asar 内部依赖）；
 * 开发/未打包态查找 out/main/connector-worker.js 或源码 ts 路径。
 */
export function resolve_connector_worker_path(base_dir: string = __dirname): string {
    const candidate = join(base_dir, "connector-worker.js");
    if (fs.existsSync(candidate)) return candidate;

    // 尝试工作区 out/main/connector-worker.js
    const out_main_candidate = resolve(process.cwd(), "out/main/connector-worker.js");
    if (fs.existsSync(out_main_candidate)) return out_main_candidate;

    // 源码回退（开发/单测环境）
    const ts_source = resolve(base_dir, "./worker/connector-worker-entry.ts");
    if (fs.existsSync(ts_source)) return ts_source;

    const cwd_source = resolve(
        process.cwd(),
        "src/main/core/connector/worker/connector-worker-entry.ts",
    );
    if (fs.existsSync(cwd_source)) return cwd_source;

    return candidate;
}

interface ProcessHandle {
    send(msg: Serializable): void;
    kill(): void;
    onMessage(fn: (msg: unknown) => void): void;
    onExit(fn: (code: number | null, signal: string | null) => void): void;
    onError(fn: (err: Error) => void): void;
    cleanup(): void;
}

function spawn_worker_process(worker_path: string): ProcessHandle {
    const is_ts = worker_path.endsWith(".ts");
    let can_use_utility = false;
    try {
        can_use_utility = !is_ts && typeof utilityProcess.fork === "function";
    } catch {
        can_use_utility = false;
    }

    if (can_use_utility) {
        const child: UtilityProcess = utilityProcess.fork(worker_path, [], {
            stdio: ["ignore", "pipe", "pipe"],
            serviceName: "connector-worker",
        });

        child.stderr?.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (line) log.error(`[connector-worker] ${line}`);
        });

        child.stdout?.on("data", (data: Buffer) => {
            const line = data.toString().trim();
            if (line) log.info(`[connector-worker] ${line}`);
        });

        return {
            send: (msg) => {
                child.postMessage(msg);
            },
            kill: () => {
                try {
                    child.kill();
                } catch {
                    // ignore
                }
            },
            onMessage: (fn) => {
                child.on("message", fn);
            },
            onExit: (fn) => {
                child.on("exit", (code) => {
                    fn(code, null);
                });
            },
            onError: (fn) => {
                child.on("error", (err: unknown) => {
                    fn(err instanceof Error ? err : new Error(String(err)));
                });
            },
            cleanup: () => {
                try {
                    child.kill();
                } catch {
                    // ignore
                }
            },
        };
    }

    const child: ChildProcess = fork(worker_path, [], {
        execArgv: is_ts ? ["--import=tsx"] : [],
        stdio: ["ignore", "inherit", "inherit", "ipc"],
    });

    return {
        send: (msg) => {
            child.send(msg);
        },
        kill: () => {
            try {
                child.kill("SIGTERM");
                setTimeout(() => {
                    try {
                        child.kill("SIGKILL");
                    } catch {
                        // ignore
                    }
                }, 200);
            } catch {
                // ignore
            }
        },
        onMessage: (fn) => {
            child.on("message", fn);
        },
        onExit: (fn) => {
            child.on("exit", (code, signal) => {
                fn(code, signal);
            });
        },
        onError: (fn) => {
            child.on("error", fn);
        },
        cleanup: () => {
            child.removeAllListeners();
            try {
                child.kill();
            } catch {
                // ignore
            }
        },
    };
}

/**
 * AC-002: 在独立隔离子进程（utilityProcess/ChildProcess）中执行连接器
 * 隔离进程的崩溃、OOM 或无限死循环由父进程超时终止，绝对不拖垮主进程
 */
export async function run_connector_isolated(
    options: RunIsolatedOptions,
): Promise<ConnectorRunResult> {
    const task_id = `task_${String(Date.now())}_${Math.random().toString(36).slice(2, 8)}`;
    const worker_path = options.worker_entry_path ?? resolve_connector_worker_path();

    const budget =
        options.budget ??
        (options.deadline_ms !== undefined &&
        Number.isFinite(options.deadline_ms) &&
        options.deadline_ms > 0
            ? create_execution_budget_from_deadline(options.deadline_ms, options.total_ms)
            : create_execution_budget(
                  options.total_ms ?? options.timeout_ms ?? DEFAULT_EXECUTION_BUDGET_MS,
              ));

    return new Promise<ConnectorRunResult>((resolve_result) => {
        let handle: ProcessHandle | null = null;
        let settled = false;

        const cleanup = () => {
            clearTimeout(timer);
            if (handle) {
                handle.cleanup();
                handle = null;
            }
        };

        const finish = (result: ConnectorRunResult) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve_result(result);
        };

        // 超时看门狗（硬上限兜底）：超过软截止 + grace period 时，强制 kill 隔离进程
        const hard_timeout_limit = Math.max(100, budget.remaining_ms() + HARD_WATCHDOG_GRACE_MS);
        const timer = setTimeout(() => {
            log.warn(
                `Connector "${options.manifest.id}" timed out in isolated process after ${String(hard_timeout_limit)}ms, killing process`,
            );
            handle?.kill();
            finish({
                observations: [],
                failed_accounts: [],
                error: `Connector execution terminated after hard deadline timeout (${String(budget.total_ms)}ms) in isolated process`,
                error_code: "TERMINATED",
                metrics: { requests: 0, bytes: 0 },
            });
        }, hard_timeout_limit);

        try {
            handle = spawn_worker_process(worker_path);
        } catch (spawn_err: unknown) {
            const msg = spawn_err instanceof Error ? spawn_err.message : String(spawn_err);
            log.error(`Failed to spawn connector worker: ${msg}`);
            finish({
                observations: [],
                failed_accounts: [],
                error: `Failed to spawn isolated worker process: ${msg}`,
                error_code: null,
                metrics: { requests: 0, bytes: 0 },
            });
            return;
        }

        // 监听进程异常崩溃或意外退出
        handle.onExit((code, signal) => {
            if (settled) return;
            log.error(
                `Connector worker process exited prematurely with code=${String(code)}, signal=${String(signal)}`,
            );
            finish({
                observations: [],
                failed_accounts: [],
                error: `Connector worker process crashed (code: ${String(code)}, signal: ${String(signal)})`,
                error_code: null,
                metrics: { requests: 0, bytes: 0 },
            });
        });

        handle.onError((err) => {
            if (settled) return;
            log.error(`Connector worker process emitted error: ${err.message}`);
            finish({
                observations: [],
                failed_accounts: [],
                error: `Connector worker process error: ${err.message}`,
                error_code: null,
                metrics: { requests: 0, bytes: 0 },
            });
        });

        // 监听子进程返回消息
        handle.onMessage((raw: unknown) => {
            if (!raw || typeof raw !== "object") return;
            const res = raw as WorkerResponsePayload;
            if (res.id !== task_id) return;

            if (res.ok && res.result) {
                finish(res.result as ConnectorRunResult);
            } else {
                finish({
                    observations: [],
                    failed_accounts: [],
                    error: res.error ?? "Isolated connector task failed without specific message",
                    error_code: res.error_code ?? null,
                    metrics: res.metrics ?? { requests: 0, bytes: 0 },
                });
            }
        });

        // 组装并发送任务
        const payload: WorkerTaskPayload = {
            id: task_id,
            manifest: options.manifest,
            script_code: options.script_code,
            compiled_code: options.compiled_code,
            total_ms: budget.total_ms,
            deadline_ms: budget.deadline_ms,
            generation: options.generation,
            params: options.params ?? {},
            instance_id: options.instance_id ?? "default",
            proxy_url: options.proxy_url,
            endpoint_overrides: options.endpoint_overrides,
        };

        handle.send(payload);
    });
}

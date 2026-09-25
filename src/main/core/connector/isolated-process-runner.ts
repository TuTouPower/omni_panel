import { fork, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { createLogger } from "../../../shared/lib/logger";
import type { Manifest } from "../../../shared/schemas/manifest";
import type { ConnectorRunResult } from "./runtime";
import type { WorkerTaskPayload, WorkerResponsePayload } from "./worker/connector-worker-entry";

const log = createLogger("isolated-connector-runner");

export interface RunIsolatedOptions {
    readonly manifest: Manifest;
    readonly script_code: string;
    readonly compiled_code?: string | undefined;
    readonly timeout_ms: number;
    readonly params?: Record<string, string> | undefined;
    readonly instance_id?: string | undefined;
    readonly proxy_url?: string | undefined;
    readonly endpoint_overrides?: Record<string, string> | undefined;
    /** 测试用：可选指定自定义 worker 入口文件路径 */
    readonly worker_entry_path?: string | undefined;
}

/**
 * AC-002: 在独立隔离子进程（utilityProcess/ChildProcess）中执行连接器
 * 隔离进程的崩溃、OOM 或无限死循环由父进程超时终止，绝对不拖垮主进程
 */
export async function run_connector_isolated(
    options: RunIsolatedOptions,
): Promise<ConnectorRunResult> {
    const task_id = `task_${String(Date.now())}_${Math.random().toString(36).slice(2, 8)}`;
    const worker_path =
        options.worker_entry_path ?? resolve(__dirname, "./worker/connector-worker-entry.ts");

    return new Promise<ConnectorRunResult>((resolve_result) => {
        let child: ChildProcess | null = null;
        let settled = false;

        const cleanup = () => {
            clearTimeout(timer);
            if (child) {
                child.removeAllListeners();
                try {
                    child.kill();
                } catch {
                    // ignore
                }
                child = null;
            }
        };

        const finish = (result: ConnectorRunResult) => {
            if (settled) return;
            settled = true;
            cleanup();
            resolve_result(result);
        };

        // 超时看门狗：如果超过 timeout_ms，强制 kill 隔离进程并 SIGKILL 兜底
        const timeout_limit = Math.max(100, options.timeout_ms);
        const timer = setTimeout(() => {
            log.warn(
                `Connector "${options.manifest.id}" timed out in isolated process after ${String(timeout_limit)}ms, killing process`,
            );
            if (child) {
                try {
                    child.kill("SIGTERM");
                    setTimeout(() => {
                        try {
                            child?.kill("SIGKILL");
                        } catch {
                            // ignore
                        }
                    }, 200);
                } catch {
                    // ignore
                }
            }
            finish({
                observations: [],
                failed_accounts: [],
                error: `Connector execution timeout after ${String(timeout_limit)}ms in isolated process`,
            });
        }, timeout_limit);

        try {
            // 在开发/测试环境下使用 tsx 运行 ts 脚本，否则直接 node 运行
            child = fork(worker_path, [], {
                execArgv: worker_path.endsWith(".ts") ? ["--import=tsx"] : [],
                stdio: ["ignore", "inherit", "inherit", "ipc"],
            });
        } catch (spawn_err: unknown) {
            const msg = spawn_err instanceof Error ? spawn_err.message : String(spawn_err);
            log.error(`Failed to spawn connector worker: ${msg}`);
            finish({
                observations: [],
                failed_accounts: [],
                error: `Failed to spawn isolated worker process: ${msg}`,
            });
            return;
        }

        // 监听进程异常崩溃或意外退出
        child.on("exit", (code, signal) => {
            if (settled) return;
            log.error(
                `Connector worker process exited prematurely with code=${String(code)}, signal=${String(signal)}`,
            );
            finish({
                observations: [],
                failed_accounts: [],
                error: `Connector worker process crashed (code: ${String(code)}, signal: ${String(signal)})`,
            });
        });

        child.on("error", (err) => {
            if (settled) return;
            log.error(`Connector worker process emitted error: ${err.message}`);
            finish({
                observations: [],
                failed_accounts: [],
                error: `Connector worker process error: ${err.message}`,
            });
        });

        // 监听子进程返回消息
        child.on("message", (raw: unknown) => {
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
                });
            }
        });

        // 组装并发送任务
        const payload: WorkerTaskPayload = {
            id: task_id,
            manifest: options.manifest,
            script_code: options.script_code,
            compiled_code: options.compiled_code,
            timeout_ms: options.timeout_ms,
            params: options.params ?? {},
            instance_id: options.instance_id ?? "default",
            proxy_url: options.proxy_url,
            endpoint_overrides: options.endpoint_overrides,
        };

        child.send(payload);
    });
}

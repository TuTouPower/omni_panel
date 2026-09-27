import { create_connector_context } from "../net-client";
import { run_connector } from "../runtime";
import {
    create_execution_budget_from_deadline,
    BudgetExhaustedError,
    TerminatedError,
} from "../execution-budget";
import type { Manifest } from "../../../../shared/schemas/manifest";
import type { VaultBackend } from "../../vault/vault-backend";
import type { ConnectorDiscoveryEntry } from "../host-io";

export interface WorkerTaskPayload {
    readonly id: string;
    readonly manifest: Manifest;
    readonly script_code: string;
    readonly compiled_code?: string | undefined;
    readonly total_ms: number;
    readonly deadline_ms: number;
    readonly generation?: number | undefined;
    readonly initial_discovery?: Record<string, ConnectorDiscoveryEntry> | undefined;
    readonly params: Record<string, string>;
    readonly instance_id: string;
    readonly proxy_url?: string | undefined;
    readonly endpoint_overrides?: Record<string, string> | undefined;
}

export interface WorkerResponsePayload {
    readonly id: string;
    readonly ok: boolean;
    readonly result?: unknown;
    readonly error?: string | undefined;
    readonly error_code?: "BUDGET_EXHAUSTED" | "TERMINATED" | "COOLDOWN" | null | undefined;
    readonly metrics?: { requests: number; bytes: number } | undefined;
    readonly discovery_delta?: Record<string, ConnectorDiscoveryEntry | null> | undefined;
}

// 模拟 Vault 内存后端（凭据已在主进程解密并通过受保护的 IPC 参数送达隔离进程）
function create_worker_vault(params: Record<string, string>): VaultBackend {
    return {
        get: (key: string) => {
            if (key in params) return Promise.resolve(params[key] ?? null);
            const parts = key.split(":");
            const bare = parts.length > 1 ? parts.slice(1).join(":") : key;
            return Promise.resolve(params[bare] ?? null);
        },
        set: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        has: (key: string) => Promise.resolve(key in params),
        list_keys: () => Promise.resolve(Object.keys(params)),
        replaceAll: () => Promise.resolve(),
    };
}

async function handle_task(task: WorkerTaskPayload): Promise<WorkerResponsePayload> {
    if (task.params["__TEST_CRASH__"] === "1") {
        process.exit(42);
    }

    const budget = create_execution_budget_from_deadline(task.deadline_ms, task.total_ms);
    const vault = create_worker_vault(task.params);
    const discovery_delta: Record<string, ConnectorDiscoveryEntry | null> = {};
    const ctx = create_connector_context(task.manifest, vault, task.instance_id, {
        params: task.params,
        budget,
        deadline_ms: task.deadline_ms,
        total_ms: task.total_ms,
        generation: task.generation,
        initial_discovery: task.initial_discovery,
        on_discovery_delta: (d) => {
            Object.assign(discovery_delta, d);
        },
        ...(task.proxy_url ? { proxy_url: task.proxy_url } : {}),
        ...(task.endpoint_overrides ? { endpoint_overrides: task.endpoint_overrides } : {}),
    });

    try {
        const result = await run_connector(
            task.manifest,
            task.script_code,
            ctx,
            budget,
            task.compiled_code,
        );
        return {
            id: task.id,
            ok: true,
            result,
            error: result.error ?? undefined,
            error_code: result.error_code,
            metrics: result.metrics,
            discovery_delta,
        };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        const error_code =
            err instanceof BudgetExhaustedError
                ? "BUDGET_EXHAUSTED"
                : err instanceof TerminatedError
                  ? "TERMINATED"
                  : null;
        return {
            id: task.id,
            ok: false,
            error: message,
            error_code,
            metrics: ctx.metrics,
        };
    }
}

// 独立进程 IPC 消息监听：双模兼容 Electron utilityProcess 与 Node child_process
interface ParentPortLike {
    postMessage(message: unknown): void;
    on(event: "message", listener: (e: { data: unknown }) => void): void;
}

const parent_port = (process as unknown as { parentPort?: ParentPortLike }).parentPort;

if (parent_port) {
    parent_port.on("message", (e: { data: unknown }) => {
        void (async () => {
            const raw = e.data;
            if (!raw || typeof raw !== "object") return;
            const task = raw as WorkerTaskPayload;
            if (!task.id) return;
            const response = await handle_task(task);
            parent_port.postMessage(response);
        })();
    });
} else if (process.send) {
    process.on("message", (msg: unknown) => {
        void (async () => {
            if (!msg || typeof msg !== "object") return;
            const task = msg as WorkerTaskPayload;
            if (!task.id) return;
            const response = await handle_task(task);
            process.send?.(response);
        })();
    });
}

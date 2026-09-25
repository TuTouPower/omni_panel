import { create_connector_context } from "../net-client";
import { run_connector } from "../runtime";
import type { Manifest } from "../../../../shared/schemas/manifest";
import type { VaultBackend } from "../../vault/vault-backend";

export interface WorkerTaskPayload {
    readonly id: string;
    readonly manifest: Manifest;
    readonly script_code: string;
    readonly compiled_code?: string | undefined;
    readonly timeout_ms: number;
    readonly params: Record<string, string>;
    readonly instance_id: string;
    readonly proxy_url?: string | undefined;
    readonly endpoint_overrides?: Record<string, string> | undefined;
}

export interface WorkerResponsePayload {
    readonly id: string;
    readonly ok: boolean;
    readonly result?: unknown;
    readonly error?: string;
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

    const vault = create_worker_vault(task.params);
    const ctx = create_connector_context(task.manifest, vault, task.instance_id, {
        params: task.params,
        timeout_ms: task.timeout_ms,
        ...(task.proxy_url ? { proxy_url: task.proxy_url } : {}),
        ...(task.endpoint_overrides ? { endpoint_overrides: task.endpoint_overrides } : {}),
    });

    try {
        const result = await run_connector(
            task.manifest,
            task.script_code,
            ctx,
            task.timeout_ms,
            task.compiled_code,
        );
        return { id: task.id, ok: true, result };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        return { id: task.id, ok: false, error: message };
    }
}

// 独立进程 IPC 消息监听
if (process.send) {
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

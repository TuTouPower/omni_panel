import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createLogger, withLogContext } from "../../../shared/lib/logger";
import { DEFAULT_TIMEOUT_MS } from "../../../shared/constants";
import type { Manifest } from "../../../shared/schemas/manifest";
import { script_observation_schema } from "../../../shared/schemas/observation";
import type { ScriptObservation, FailedAccount } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";

const log = createLogger("connector-runtime");
const TIMEOUT_ERROR = "Connector script execution timeout";

export interface ConnectorRunResult {
    readonly observations: ScriptObservation[];
    readonly failed_accounts: FailedAccount[];
    readonly error: string | null;
}

export function deep_freeze<T>(value: T, seen = new WeakSet<object>()): T {
    if (value !== null && typeof value === "object") {
        if (seen.has(value)) return value;
        seen.add(value);
        for (const child of Object.values(value as Record<string, unknown>)) {
            deep_freeze(child, seen);
        }
        Object.freeze(value);
    }
    return value;
}

function create_sandbox_context(ctx: ConnectorContext): vm.Context {
    return vm.createContext(
        Object.freeze({
            ctx: deep_freeze(ctx),
        }),
    );
}

// Known node:vm sandbox-escape vectors. node:vm is NOT a security boundary
// (architecture.md §6), but a user-contributed connector could trivially grab
// host fs/child_process/secrets via these patterns. Reject them at compile time
// as a short-term mitigation before moving to isolated-vm.
const SANDBOX_ESCAPE_PATTERNS: readonly { pattern: RegExp; label: string }[] = [
    // Direct/indirect eval - (0, eval)("this") reaches the global scope.
    { pattern: /(^|[^.\w])eval\s*\(/, label: "eval" },
    { pattern: /,\s*eval\s*\)/, label: "indirect eval" },
    // Function constructor - new Function("...") compiles arbitrary code in
    // the host realm, bypassing the sandbox entirely.
    { pattern: /\bnew\s+Function\s*\(/, label: "Function constructor" },
    { pattern: /(^|[^.\w])Function\s*\(/, label: "Function constructor" },
    // .constructor.constructor walks up to Function - same escape as above.
    { pattern: /\.constructor\s*\.\s*constructor/, label: "constructor chain" },
    // process.binding reaches native internals.
    { pattern: /\bprocess\s*\.\s*binding\b/, label: "process.binding" },
];

function detect_sandbox_escape(code: string): string | null {
    for (const { pattern, label } of SANDBOX_ESCAPE_PATTERNS) {
        if (pattern.test(code)) {
            return label;
        }
    }
    return null;
}

export function compile_script(script_code: string): string {
    const stripped_code = script_code
        .replace(/^import\s+type\s+[^;]+;\s*$/gm, "")
        .replace(/^declare\s+const\s+[^;]+;\s*$/gm, "");
    if (/^\s*(?:import|export)\s/m.test(stripped_code)) {
        throw new Error("Connector scripts cannot use import or export statements");
    }
    const escape = detect_sandbox_escape(stripped_code);
    if (escape) {
        throw new Error(
            `Connector script rejected: sandbox escape vector (${escape}) - connectors must not use ${escape}`,
        );
    }
    return transpileModule(
        `(async () =>{\n${stripped_code}\nif (typeof main === "function") return await main();\n})()`,
        {
            compilerOptions: {
                module: ModuleKind.CommonJS,
                target: ScriptTarget.ES2022,
            },
        },
    ).outputText;
}

function get_error_message(error: unknown): string {
    const raw =
        error instanceof Error
            ? error.message
            : typeof error === "object" &&
                error !== null &&
                "message" in error &&
                typeof error.message === "string"
              ? error.message
              : String(error);
    return raw;
}

function is_timeout_error(message: string): boolean {
    return /timed? out|execution timeout|script execution timeout/i.test(message);
}

class ConnectorTimeoutError extends Error {
    constructor(timeout_ms: number) {
        super(`${TIMEOUT_ERROR} after ${String(timeout_ms)}ms`);
        this.name = "ConnectorTimeoutError";
    }
}

function race_with_timeout<T>(promise: Promise<T>, timeout_ms: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new ConnectorTimeoutError(timeout_ms));
        }, timeout_ms);
        promise.then(
            (value) => {
                clearTimeout(timer);
                resolve(value);
            },
            (reason: unknown) => {
                clearTimeout(timer);
                reject(new Error(get_error_message(reason)));
            },
        );
    });
}

export async function run_connector(
    manifest: Manifest,
    script_code: string,
    ctx: ConnectorContext,
    timeout_ms: number = DEFAULT_TIMEOUT_MS,
    compiled_code?: string,
): Promise<ConnectorRunResult> {
    if (!manifest.script) {
        return { observations: [], failed_accounts: [], error: "No script defined in manifest" };
    }

    // t371 AC-001: 超时冷却——vm timeout 只断同步执行，超时结算后 VM 内异步残留
    // promise 可能继续打上游（生命周期不可知）。冷却期内（2x timeout）拒绝同
    // manifest 新执行，避免残留与重试叠加；正常完成的执行不设冷却，同 manifest
    // 多实例并发不受影响（in-flight 互斥会误伤 refreshAll 的多账号并发）。
    const until = script_cooldown_until.get(manifest.id);
    if (until !== undefined) {
        if (Date.now() < until) {
            return {
                observations: [],
                failed_accounts: [],
                error: `Connector ${manifest.id} is cooling down after a previous timeout (residual script work may still be running)`,
            };
        }
        script_cooldown_until.delete(manifest.id);
    }

    const result = await run_connector_inner(manifest, script_code, ctx, timeout_ms, compiled_code);
    if (result.error !== null && is_timeout_error(result.error)) {
        const cooldown = timeout_ms * 2;
        script_cooldown_until.set(manifest.id, Date.now() + cooldown);
        log.warn(
            `Connector ${manifest.id} timed out; cooling down for ${String(cooldown)}ms before next execution`,
        );
    }
    return result;
}

// t371 AC-001: manifest.id → 冷却截止时间戳（模块级，跨刷新共享）。
const script_cooldown_until = new Map<string, number>();

async function run_connector_inner(
    manifest: Manifest,
    script_code: string,
    ctx: ConnectorContext,
    timeout_ms: number,
    compiled_code?: string,
): Promise<ConnectorRunResult> {
    const runtime_log = ctx.trace_id ? withLogContext(log, { trace_id: ctx.trace_id }) : log;

    // 收集脚本通过 ctx.report_failed_account 上报的失败账号。
    // 用 wrapper 注入收集实现，覆盖 ctx 上可能存在的 no-op（来自
    // net-client）。脚本只调 ctx.report_failed_account，不感知收集细节。
    const failed_accounts: FailedAccount[] = [];
    const ctx_with_collector: ConnectorContext = {
        ...ctx,
        report_failed_account: (
            provider: string,
            account_id: string,
            account_label: string,
            error: string,
        ) => {
            failed_accounts.push({ provider, account_id, account_label, error });
        },
    };

    try {
        const context = create_sandbox_context(ctx_with_collector);
        // t195: 传入 compiled_code 时跳过 transpile（script-cache 已按 mtime 缓存）。
        const compiled = compiled_code ?? compile_script(script_code);
        runtime_log.debug(
            `Connector ${manifest.id}: compiled, running in VM (timeout=${String(timeout_ms)}ms)`,
        );
        const raw_result: unknown = vm.runInContext(compiled, context, {
            timeout: timeout_ms,
        }) as unknown;
        runtime_log.debug(
            `Connector ${manifest.id}: vm.runInContext returned type=${typeof raw_result}, isPromise=${String(raw_result instanceof Promise)}`,
        );
        const result: unknown = await race_with_timeout(Promise.resolve(raw_result), timeout_ms);
        runtime_log.debug(`Connector ${manifest.id}: race_with_timeout resolved`);

        if (!Array.isArray(result)) {
            return { observations: [], failed_accounts, error: "Script did not return an array" };
        }

        const observations: ScriptObservation[] = [];
        for (const item of result) {
            const parsed = script_observation_schema.safeParse(item);
            if (!parsed.success) {
                // t371 AC-003: 校验失败不再静默丢条——report_failed_account 计入
                // 错误摘要，runtime store 状态可见（原仅 warn）。account_id 取观测
                // 自身字段（合法时），避免误匹配真实 "default" 账号的 stale 副本。
                const detail = parsed.error.issues
                    .slice(0, 3)
                    .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
                    .join("; ");
                runtime_log.warn(`Skipping invalid observation: ${parsed.error.message}`);
                const raw_account_id = (item as Record<string, unknown> | null)?.["account_id"];
                failed_accounts.push({
                    provider: manifest.provider,
                    account_id:
                        typeof raw_account_id === "string" && raw_account_id !== ""
                            ? raw_account_id
                            : "unknown",
                    account_label: manifest.provider,
                    error: `observation schema validation failed: ${detail}`,
                });
                continue;
            }
            observations.push(parsed.data as ScriptObservation);
        }

        runtime_log.info(
            `Connector ${manifest.id}: ${String(observations.length)} valid observations (from ${String(result.length)} raw)`,
        );
        return { observations, failed_accounts, error: null };
    } catch (error) {
        const message = get_error_message(error);
        const normalized = is_timeout_error(message) ? `${TIMEOUT_ERROR}: ${message}` : message;
        runtime_log.error(`Connector execution failed: ${normalized}`);
        return { observations: [], failed_accounts, error: normalized };
    }
}

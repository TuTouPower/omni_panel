import vm from "node:vm";
import { randomUUID } from "node:crypto";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { z } from "zod/v3";
import { createLogger, withLogContext, scrubber } from "../../../shared/lib/logger";
import { DEFAULT_TIMEOUT_MS } from "../../../shared/constants";
import type { Manifest } from "../../../shared/schemas/manifest";
import { script_observation_schema } from "../../../shared/schemas/observation";
import type { ScriptObservation, FailedAccount } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";

const log = createLogger("connector-runtime");
const TIMEOUT_ERROR = "Connector script execution timeout";

// A40 / A42: 不可重试错误基类与判断函数
export class NonRetryableError extends Error {
    readonly non_retryable = true;
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "NonRetryableError";
    }
}

export function is_non_retryable_error(error: unknown): boolean {
    if (!error) return false;
    if (typeof error === "object" && "non_retryable" in error && Boolean(error.non_retryable)) {
        return true;
    }
    if (error instanceof SyntaxError || (error instanceof Error && error.name === "SyntaxError")) {
        return true;
    }
    const msg =
        error instanceof Error
            ? error.message
            : typeof error === "string"
              ? error
              : typeof error === "object" && "message" in error && typeof error.message === "string"
                ? error.message
                : "";
    if (
        /SyntaxError/i.test(msg) ||
        /Connector script rejected/i.test(msg) ||
        /Connector scripts cannot use import or export statements/i.test(msg)
    ) {
        return true;
    }
    const http_status_match = /HTTP\s+(\d{3})/i.exec(msg);
    if (http_status_match?.[1]) {
        const status = Number.parseInt(http_status_match[1], 10);
        // 4xx 中排除 408 Request Timeout 与 429 Too Many Requests
        if (status >= 400 && status < 500 && status !== 408 && status !== 429) {
            return true;
        }
    }
    return false;
}

export interface ConnectorRunResult {
    readonly observations: ScriptObservation[];
    readonly failed_accounts: FailedAccount[];
    readonly error: string | null;
}

export function deep_freeze<T>(value: T, seen = new WeakSet<object>()): T {
    if (value !== null && typeof value === "object") {
        if (seen.has(value) || value === (z as unknown)) return value;
        seen.add(value);
        for (const child of Object.values(value as Record<string, unknown>)) {
            deep_freeze(child, seen);
        }
        try {
            Object.freeze(value);
        } catch {
            // 忽略包含不可配置 getter 的第三方对象冻结异常
        }
    }
    return value;
}

function create_sandbox_context(ctx: ConnectorContext): vm.Context {
    return vm.createContext(
        Object.freeze({
            ctx: deep_freeze({
                ...ctx,
                z,
            }),
            z,
            // A75: 注入安全的 crypto.randomUUID 供连接器调用
            crypto: Object.freeze({
                randomUUID: () => randomUUID(),
            }),
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

// A122: 高性能 observation 快速结构前置校验，减轻大规模 safeParse 压力
function is_fast_valid_observation(item: unknown): item is ScriptObservation {
    if (typeof item !== "object" || item === null) return false;
    const o = item as Record<string, unknown>;
    return (
        typeof o["provider"] === "string" &&
        o["provider"].length > 0 &&
        typeof o["account_id"] === "string" &&
        o["account_id"].length > 0 &&
        typeof o["account_label"] === "string" &&
        typeof o["metric_id"] === "string" &&
        o["metric_id"].length > 0 &&
        typeof o["raw_label"] === "string" &&
        o["raw_label"].length > 0 &&
        typeof o["normalized_label"] === "string" &&
        o["normalized_label"].length > 0 &&
        (o["window"] === "second" ||
            o["window"] === "day" ||
            o["window"] === "week" ||
            o["window"] === "month" ||
            o["window"] === "total") &&
        (o["used"] === null || (typeof o["used"] === "number" && Number.isFinite(o["used"]))) &&
        (o["limit"] === null || (typeof o["limit"] === "number" && Number.isFinite(o["limit"]))) &&
        (o["display_style"] === "percent" || o["display_style"] === "ratio") &&
        (o["reset_at"] === null ||
            (typeof o["reset_at"] === "number" && Number.isFinite(o["reset_at"]))) &&
        (o["status"] === "normal" ||
            o["status"] === "warning" ||
            o["status"] === "critical" ||
            o["status"] === "unknown") &&
        typeof o["observed_at"] === "number" &&
        Number.isFinite(o["observed_at"]) &&
        (o["source"] === "poll" ||
            o["source"] === "local" ||
            o["source"] === "session" ||
            o["source"] === "wrapper" ||
            o["source"] === "probe" ||
            o["source"] === "gateway") &&
        typeof o["stale"] === "boolean" &&
        (o["last_error"] === null || typeof o["last_error"] === "string")
    );
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

    // A93 / AC-004: 冷却 key 结合 source_instance_id，隔离同一连接器的多账号实例
    const cooldown_key = ctx.instance_id ? `${manifest.id}:${ctx.instance_id}` : manifest.id;
    const until = script_cooldown_until.get(cooldown_key);
    if (until !== undefined) {
        if (Date.now() < until) {
            return {
                observations: [],
                failed_accounts: [],
                error: `Connector ${manifest.id} is cooling down after a previous timeout (residual script work may still be running)`,
            };
        }
        script_cooldown_until.delete(cooldown_key);
    }

    const result = await run_connector_inner(manifest, script_code, ctx, timeout_ms, compiled_code);
    if (result.error !== null && is_timeout_error(result.error)) {
        const cooldown = timeout_ms * 2;
        script_cooldown_until.set(cooldown_key, Date.now() + cooldown);
        log.warn(
            `Connector ${manifest.id} (instance ${ctx.instance_id ?? "default"}) timed out; cooling down for ${String(cooldown)}ms before next execution`,
        );
    }
    return result;
}

// A93: cooldown_key → 冷却截止时间戳（模块级，跨刷新共享）。
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
            // A122: fast-path 优先校验，命中直接跳过 full zod parse
            if (is_fast_valid_observation(item)) {
                observations.push(item);
                continue;
            }
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
        const raw_stack = error instanceof Error ? error.stack : undefined;
        // A39: 附带脱敏后 stack 记录排障信息
        const scrubbed_stack = raw_stack ? scrubber.scrub_text(raw_stack) : undefined;
        const normalized = is_timeout_error(message) ? `${TIMEOUT_ERROR}: ${message}` : message;
        runtime_log.error(`Connector execution failed: ${normalized}`, { stack: scrubbed_stack });
        return { observations: [], failed_accounts, error: normalized };
    }
}

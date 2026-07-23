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
// as a short-term mitigation before moving to isolated-vm (D8).
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

function compile_script(script_code: string): string {
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
): Promise<ConnectorRunResult> {
    if (!manifest.script) {
        return { observations: [], failed_accounts: [], error: "No script defined in manifest" };
    }

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
        const compiled = compile_script(script_code);
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
                runtime_log.warn(`Skipping invalid observation: ${parsed.error.message}`);
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

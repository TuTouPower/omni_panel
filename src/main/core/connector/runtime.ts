import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createLogger } from "../../../shared/lib/logger";
import { DEFAULT_TIMEOUT_MS } from "../../../shared/constants";
import type { Manifest } from "../../../shared/schemas/manifest";
import { observation_schema } from "../../../shared/schemas/observation";
import type { Observation } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";

const log = createLogger("connector-runtime");
const TIMEOUT_ERROR = "Connector script execution timeout";

export interface ConnectorRunResult {
    readonly observations: Observation[];
    readonly error: string | null;
}

function deep_freeze<T>(value: T, seen = new WeakSet<object>()): T {
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

function compile_script(script_code: string): string {
    const stripped_code = script_code
        .replace(/^import\s+type\s+[^;]+;\s*$/gm, "")
        .replace(/^declare\s+const\s+[^;]+;\s*$/gm, "");
    if (/^\s*(?:import|export)\s/m.test(stripped_code)) {
        throw new Error("Connector scripts cannot use import or export statements");
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
        return { observations: [], error: "No script defined in manifest" };
    }

    try {
        const context = create_sandbox_context(ctx);
        const compiled = compile_script(script_code);
        log.debug(
            `Connector ${manifest.id}: compiled, running in VM (timeout=${String(timeout_ms)}ms)`,
        );
        const raw_result: unknown = vm.runInContext(compiled, context, {
            timeout: timeout_ms,
        }) as unknown;
        log.debug(
            `Connector ${manifest.id}: vm.runInContext returned type=${typeof raw_result}, isPromise=${String(raw_result instanceof Promise)}`,
        );
        const result: unknown = await race_with_timeout(Promise.resolve(raw_result), timeout_ms);
        log.debug(`Connector ${manifest.id}: race_with_timeout resolved`);

        if (!Array.isArray(result)) {
            return { observations: [], error: "Script did not return an array" };
        }

        const observations: Observation[] = [];
        for (const item of result) {
            const parsed = observation_schema.safeParse(item);
            if (!parsed.success) {
                log.warn(`Skipping invalid observation: ${parsed.error.message}`);
                continue;
            }
            observations.push(parsed.data as unknown as Observation);
        }

        return { observations, error: null };
    } catch (error) {
        const message = get_error_message(error);
        const normalized = is_timeout_error(message) ? `${TIMEOUT_ERROR}: ${message}` : message;
        log.error(`Connector execution failed: ${normalized}`);
        return { observations: [], error: normalized };
    }
}

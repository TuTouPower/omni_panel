import vm from "node:vm";
import { ModuleKind, ScriptTarget, transpileModule } from "typescript";
import { createLogger } from "../../../shared/lib/logger";
import type { Manifest } from "../../../shared/schemas/manifest";
import { observation_schema } from "../../../shared/schemas/observation";
import type { Observation } from "../../../shared/types/observation";
import type { ConnectorContext } from "./host-io";

const log = createLogger("connector-runtime");
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ConnectorRunResult {
    readonly observations: Observation[];
    readonly error: string | null;
}

function create_sandbox_context(ctx: ConnectorContext): vm.Context {
    return vm.createContext(
        Object.freeze({
            ctx,
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
        `(async () => {\n${stripped_code}\nif (typeof main === "function") return await main();\n})()`,
        {
            compilerOptions: {
                module: ModuleKind.CommonJS,
                target: ScriptTarget.ES2022,
            },
        },
    ).outputText;
}

function get_error_message(error: unknown): string {
    if (error instanceof Error) return error.message;
    if (
        typeof error === "object" &&
        error !== null &&
        "message" in error &&
        typeof error.message === "string"
    ) {
        return error.message;
    }
    return String(error);
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
        const raw_result: unknown = vm.runInContext(compile_script(script_code), context, {
            timeout: timeout_ms,
        }) as unknown;
        const result: unknown = await Promise.resolve(raw_result);

        if (!Array.isArray(result)) {
            return { observations: [], error: "Script did not return an array" };
        }

        const observations: Observation[] = [];
        for (const item of result) {
            const parsed = observation_schema.safeParse(item);
            if (!parsed.success) {
                return { observations: [], error: `Invalid observation: ${parsed.error.message}` };
            }
            observations.push(parsed.data);
        }

        return { observations, error: null };
    } catch (error) {
        const message = get_error_message(error);
        log.error(`Connector execution failed: ${message}`);
        return { observations: [], error: message };
    }
}

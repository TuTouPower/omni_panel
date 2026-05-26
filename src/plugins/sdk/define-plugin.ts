import type { PluginOutput } from "./result";
import { fail } from "./result";
import { PluginHttpError } from "./http";

export interface PluginContext {
    params: Record<string, string>;
}

export type PluginHandler = (ctx: PluginContext) => Promise<PluginOutput>;

export function parseArgs(argv = process.argv.slice(2)): Record<string, string> {
    const params: Record<string, string> = {};
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--usageboard-param" && i + 1 < argv.length) {
            const pair = argv[++i];
            if (pair === undefined) continue;
            const eqIdx = pair.indexOf("=");
            if (eqIdx > 0) {
                params[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
            }
        }
    }
    return params;
}

export function requireParam(params: Record<string, string>, key: string): string {
    const value = params[key];
    if (!value) {
        throw new Error(`MISSING_PARAM:${key}`);
    }
    return value;
}

export function definePlugin(handler: PluginHandler): void {
    const params = parseArgs();
    handler({ params })
        .then((result) => {
            process.stdout.write(JSON.stringify(result));
        })
        .catch((err: unknown) => {
            const result = normalizeError(err);
            process.stdout.write(JSON.stringify(result));
        });
}

function normalizeError(err: unknown): PluginOutput {
    if (err instanceof PluginHttpError) {
        return fail(`HTTP_${String(err.statusCode)}`, err.message);
    }
    if (err instanceof Error) {
        if (err.message.startsWith("MISSING_PARAM:")) {
            const key = err.message.slice("MISSING_PARAM:".length);
            return fail("MISSING_PARAM", `Missing required parameter: ${key}`);
        }
        return fail("PLUGIN_ERROR", err.message);
    }
    return fail("PLUGIN_ERROR", String(err));
}

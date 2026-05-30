import { writeSync } from "node:fs";
import type { PluginOutput } from "./result";
import { fail } from "./result";
import { createHttpClient, type HttpClient } from "./http-client";
import type { HttpError } from "./errors";
import { appLanguage, makeTranslator, type AppLanguage } from "./helpers";

export type CtxTranslateFn = (key: string, kwargs?: Record<string, string | number>) => string;

export interface PluginContext {
    readonly params: Record<string, string>;
    readonly http: HttpClient;
    readonly language: AppLanguage;
    readonly t: CtxTranslateFn;
}

export type PluginHandler = (ctx: PluginContext) => Promise<PluginOutput>;

export interface DefinePluginOptions {
    readonly metadata?: {
        readonly endpoints?: Record<string, string | null>;
    };
    readonly translations?: Record<string, Record<string, string>>;
}

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

export function definePlugin(handler: PluginHandler, options: DefinePluginOptions = {}): void {
    const params = parseArgs();
    const language = appLanguage(params);
    const translate = makeTranslator(options.translations ?? {});
    const ctx: PluginContext = {
        params,
        http: createHttpClient(options.metadata?.endpoints),
        language,
        t: (key, kwargs) => translate(language, key, kwargs),
    };
    handler(ctx)
        .then((result) => {
            // Synchronous write to fd 1: process.stdout.write is async on
            // Windows pipes, and the subprocess can exit before stdout flushes
            // under parallel test load, leaving the harness with empty output.
            writeSync(1, JSON.stringify(result));
        })
        .catch((err: unknown) => {
            writeSync(1, JSON.stringify(normalizeError(err)));
        });
}

function normalizeError(err: unknown): PluginOutput {
    if (err instanceof Error) {
        if (err.message.startsWith("MISSING_PARAM:")) {
            const key = err.message.slice("MISSING_PARAM:".length);
            return fail("MISSING_PARAM", `Missing required parameter: ${key}`);
        }
        return fail("PLUGIN_ERROR", err.message);
    }
    return fail("PLUGIN_ERROR", String(err));
}

export function failFromHttp(err: HttpError, contextLabel?: string): PluginOutput {
    const prefix = contextLabel ? `${contextLabel}: ` : "";
    switch (err.kind) {
        case "network":
            return fail("NETWORK_ERROR", `${prefix}${err.message}`);
        case "timeout":
            return fail("TIMEOUT", `${prefix}request exceeded ${String(err.timeoutMs)}ms`);
        case "http":
            return fail(`HTTP_${String(err.status)}`, `${prefix}HTTP ${String(err.status)}`);
        case "invalid_json":
            return fail("INVALID_RESPONSE", `${prefix}invalid JSON (status ${String(err.status)})`);
        case "missing_endpoint":
            return fail("MISSING_ENDPOINT", `${prefix}endpoint "${err.key}" not configured`);
    }
}

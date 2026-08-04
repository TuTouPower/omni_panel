import { readFile, stat } from "node:fs/promises";
import { compile_script } from "./runtime";

export interface CompiledConnectorScript {
    readonly code: string;
    readonly compiled: string;
}

interface CachedScript {
    readonly mtime_ms: number;
    readonly code: string;
    readonly compiled: string;
}

export interface ScriptCache {
    /**
     * Return the connector script source and its transpiled output, re-reading
     * and re-transpiling only when the file mtime changed (t195). Hot-path
     * refreshes with unchanged scripts skip disk read + TypeScript compile.
     */
    get_script(script_path: string): Promise<CompiledConnectorScript>;
}

export function create_script_cache(): ScriptCache {
    const cache = new Map<string, CachedScript>();

    return {
        async get_script(script_path: string): Promise<CompiledConnectorScript> {
            const file_stat = await stat(script_path);
            const mtime_ms = file_stat.mtimeMs;
            const hit = cache.get(script_path);
            if (hit?.mtime_ms === mtime_ms) {
                return { code: hit.code, compiled: hit.compiled };
            }
            const code = await readFile(script_path, "utf8");
            const compiled = compile_script(code);
            cache.set(script_path, { mtime_ms, code, compiled });
            return { code, compiled };
        },
    };
}

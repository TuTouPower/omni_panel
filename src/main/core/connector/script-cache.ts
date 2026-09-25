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

export const DEFAULT_SCRIPT_CACHE_MAX_SIZE = 50;

export function create_script_cache(max_size: number = DEFAULT_SCRIPT_CACHE_MAX_SIZE): ScriptCache {
    const cache = new Map<string, CachedScript>();
    // A123: inflight 并发去重 Map
    const inflight = new Map<string, Promise<CompiledConnectorScript>>();

    return {
        async get_script(script_path: string): Promise<CompiledConnectorScript> {
            const running = inflight.get(script_path);
            if (running) {
                return running;
            }

            const promise = (async () => {
                const file_stat = await stat(script_path);
                const mtime_ms = file_stat.mtimeMs;
                const hit = cache.get(script_path);
                if (hit?.mtime_ms === mtime_ms) {
                    // A123: LRU 命中刷新访问顺序
                    cache.delete(script_path);
                    cache.set(script_path, hit);
                    return { code: hit.code, compiled: hit.compiled };
                }
                const code = await readFile(script_path, "utf8");
                const compiled = compile_script(code);

                // A123: LRU 容量超限淘汰
                if (cache.size >= max_size) {
                    const oldest_key = cache.keys().next().value;
                    if (oldest_key !== undefined) {
                        cache.delete(oldest_key);
                    }
                }
                cache.set(script_path, { mtime_ms, code, compiled });
                return { code, compiled };
            })();

            inflight.set(script_path, promise);
            try {
                return await promise;
            } finally {
                inflight.delete(script_path);
            }
        },
    };
}

import { readFile, writeFile, unlink, mkdir, rename } from "node:fs/promises";
import { resolve, relative } from "node:path";
import type { PluginCachedState } from "./types";

export interface CacheStore {
    load(stateId: string): Promise<PluginCachedState | null>;
    save(stateId: string, state: PluginCachedState): Promise<void>;
    delete(stateId: string): Promise<void>;
}

const VALID_STATE_ID = /^[a-zA-Z0-9_-]+$/;

export function createCacheStore(statesDir: string): CacheStore {
    const resolvedDir = resolve(statesDir);

    function getPath(stateId: string): string {
        if (!VALID_STATE_ID.test(stateId)) {
            throw new Error(`Invalid stateId: ${stateId}`);
        }
        const target = resolve(resolvedDir, `${stateId}.json`);
        const rel = relative(resolvedDir, target);
        if (rel.startsWith("..") || resolve(resolvedDir, rel) !== target) {
            throw new Error(`Path traversal detected: ${stateId}`);
        }
        return target;
    }

    return {
        async load(stateId: string): Promise<PluginCachedState | null> {
            const path = getPath(stateId);
            try {
                const raw = await readFile(path, "utf8");
                return JSON.parse(raw) as PluginCachedState;
            } catch {
                return null;
            }
        },

        async save(stateId: string, state: PluginCachedState): Promise<void> {
            await mkdir(statesDir, { recursive: true });
            const path = getPath(stateId);
            const tmpPath = `${path}.tmp`;
            await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
            await rename(tmpPath, path);
        },

        async delete(stateId: string): Promise<void> {
            const path = getPath(stateId);
            try {
                await unlink(path);
            } catch {
                // ignore if file doesn't exist
            }
        },
    };
}

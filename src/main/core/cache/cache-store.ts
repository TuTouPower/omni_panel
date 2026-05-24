import { readFile, writeFile, unlink, mkdir, rename } from "node:fs/promises";
import { join } from "node:path";
import type { PluginCachedState } from "./types";

export interface CacheStore {
    load(stateId: string): Promise<PluginCachedState | null>;
    save(stateId: string, state: PluginCachedState): Promise<void>;
    delete(stateId: string): Promise<void>;
}

export function createCacheStore(statesDir: string): CacheStore {
    function getPath(stateId: string): string {
        return join(statesDir, `${stateId}.json`);
    }

    return {
        async load(stateId: string): Promise<PluginCachedState | null> {
            try {
                const raw = await readFile(getPath(stateId), "utf8");
                return JSON.parse(raw) as PluginCachedState;
            } catch {
                return null;
            }
        },

        async save(stateId: string, state: PluginCachedState): Promise<void> {
            await mkdir(statesDir, { recursive: true });
            const tmpPath = `${getPath(stateId)}.tmp`;
            await writeFile(tmpPath, JSON.stringify(state, null, 2), "utf8");
            await rename(tmpPath, getPath(stateId));
        },

        async delete(stateId: string): Promise<void> {
            try {
                await unlink(getPath(stateId));
            } catch {
                // ignore if file doesn't exist
            }
        },
    };
}

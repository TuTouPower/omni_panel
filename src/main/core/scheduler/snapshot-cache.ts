import { readFile } from "node:fs/promises";
import type { ConnectorSnapshotState, SnapshotSuccess } from "./types";
import { writeJsonAtomic } from "../storage/write-json";
import { createLogger } from "../../../shared/lib/logger";

const log = createLogger("snapshot-cache");

interface ReadyCacheEntry {
    readonly instanceId: string;
    readonly status: "ready";
    readonly items: SnapshotSuccess["items"];
    readonly updatedAt: string;
    readonly badge?: string;
    readonly chart?: SnapshotSuccess["chart"];
}

interface FailedCacheEntry {
    readonly instanceId: string;
    readonly status: "failed";
    readonly error: string;
    readonly updatedAt?: string;
    readonly items?: SnapshotSuccess["items"];
    readonly badge?: string;
    readonly chart?: SnapshotSuccess["chart"];
}

interface LoadingCacheEntry {
    readonly instanceId: string;
    readonly status: "loading";
    readonly updatedAt?: string;
    readonly items?: SnapshotSuccess["items"];
    readonly badge?: string;
    readonly chart?: SnapshotSuccess["chart"];
}

interface IdleCacheEntry {
    readonly instanceId: string;
    readonly status: "idle";
}

type CacheEntry = ReadyCacheEntry | FailedCacheEntry | LoadingCacheEntry | IdleCacheEntry;

export function serialize_state(instanceId: string, state: ConnectorSnapshotState): CacheEntry {
    switch (state.status) {
        case "idle":
            return { instanceId, status: "idle" };
        case "loading":
            return {
                instanceId,
                status: "loading",
                ...(state.lastSuccess !== undefined && {
                    updatedAt: state.lastSuccess.updatedAt,
                    items: state.lastSuccess.items,
                    ...(state.lastSuccess.badge !== undefined && {
                        badge: state.lastSuccess.badge,
                    }),
                    ...(state.lastSuccess.chart !== undefined && {
                        chart: state.lastSuccess.chart,
                    }),
                }),
            };
        case "ready":
            return {
                instanceId,
                status: "ready",
                items: state.items,
                updatedAt: state.updatedAt.toISOString(),
                ...(state.badge !== undefined && { badge: state.badge }),
                ...(state.chart !== undefined && { chart: state.chart }),
            };
        case "failed":
            return {
                instanceId,
                status: "failed",
                error: state.error,
                ...(state.lastSuccess !== undefined && {
                    updatedAt: state.lastSuccess.updatedAt,
                    items: state.lastSuccess.items,
                    ...(state.lastSuccess.badge !== undefined && {
                        badge: state.lastSuccess.badge,
                    }),
                    ...(state.lastSuccess.chart !== undefined && {
                        chart: state.lastSuccess.chart,
                    }),
                }),
            };
    }
}

export function deserialize_entry(entry: CacheEntry): ConnectorSnapshotState {
    switch (entry.status) {
        case "idle":
            return { status: "idle" };
        case "loading": {
            if (entry.items !== undefined && entry.updatedAt !== undefined) {
                const success: SnapshotSuccess = {
                    updatedAt: entry.updatedAt,
                    items: entry.items,
                    ...(entry.badge !== undefined && { badge: entry.badge }),
                    ...(entry.chart !== undefined && { chart: entry.chart }),
                };
                return { status: "loading", lastSuccess: success };
            }
            return { status: "loading" };
        }
        case "ready": {
            const result: ConnectorSnapshotState = {
                status: "ready",
                items: entry.items,
                updatedAt: new Date(entry.updatedAt),
                ...(entry.badge !== undefined && { badge: entry.badge }),
                ...(entry.chart !== undefined && { chart: entry.chart }),
            };
            return result;
        }
        case "failed": {
            if (entry.items !== undefined && entry.updatedAt !== undefined) {
                const success: SnapshotSuccess = {
                    updatedAt: entry.updatedAt,
                    items: entry.items,
                    ...(entry.badge !== undefined && { badge: entry.badge }),
                    ...(entry.chart !== undefined && { chart: entry.chart }),
                };
                return { status: "failed", error: entry.error, lastSuccess: success };
            }
            return { status: "failed", error: entry.error };
        }
    }
}

export interface SnapshotCache {
    load(): Promise<Map<string, ConnectorSnapshotState>>;
    save(snapshots: ReadonlyMap<string, ConnectorSnapshotState>): Promise<void>;
}

export function createSnapshotCache(cachePath: string): SnapshotCache {
    return {
        async load(): Promise<Map<string, ConnectorSnapshotState>> {
            try {
                const raw = await readFile(cachePath, "utf8");
                const parsed = JSON.parse(raw) as unknown;
                if (!Array.isArray(parsed)) return new Map();
                const result = new Map<string, ConnectorSnapshotState>();
                for (const entry of parsed) {
                    if (
                        entry !== null &&
                        typeof entry === "object" &&
                        "instanceId" in entry &&
                        "status" in entry
                    ) {
                        const item = entry as CacheEntry;
                        result.set(item.instanceId, deserialize_entry(item));
                    }
                }
                log.info(`Loaded ${String(result.size)} cached snapshots from ${cachePath}`);
                return result;
            } catch (err: unknown) {
                if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
                    log.warn(`Failed to load snapshot cache from ${cachePath}`, err);
                }
                return new Map();
            }
        },

        async save(snapshots: ReadonlyMap<string, ConnectorSnapshotState>): Promise<void> {
            const entries: CacheEntry[] = [];
            for (const [id, state] of snapshots) {
                if (state.status !== "idle") {
                    entries.push(serialize_state(id, state));
                }
            }
            try {
                await writeJsonAtomic(cachePath, entries);
                log.debug(`Saved ${String(entries.length)} snapshots to ${cachePath}`);
            } catch (err) {
                log.warn(`Failed to save snapshot cache to ${cachePath}`, err);
            }
        },
    };
}

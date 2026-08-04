import { promises as fs } from "node:fs";
import type { SessionScanState } from "./claude-reader";
import type { KimiScanState } from "./kimi-reader";
import type { GrokScanState } from "./grok-reader";
import { writeJsonAtomic } from "../storage/write-json";

/**
 * Scan-state persistence for the token-stats collector (extracted from
 * collector.ts in t117). The collector owns the in-memory maps; these helpers
 * serialize/deserialize them to `<dataRoot>/token-stats-scan-state.json` so a
 * restart resumes incrementally instead of rescanning every jsonl.
 */

export interface SerializedScanState {
    costs_state?: Record<string, { offset: number; size: number }>;
    opencode_max_updated?: Record<string, number>;
    jsonl_states?: Record<string, SerializedScanBucket>;
    kimi_states?: Record<string, SerializedScanBucket>;
    grok_states?: Record<string, SerializedScanBucket>;
}

export interface SerializedScanBucket {
    mtimes?: Record<string, number>;
    files?: Record<
        string,
        {
            session_id: string;
            facts?: Record<string, unknown>;
        }
    >;
}

export interface ScanStateMaps {
    readonly costs_state: Map<string, { offset: number; size: number }>;
    readonly opencode_max_updated: Map<string, number>;
    readonly jsonl_states: Map<string, SessionScanState>;
    readonly kimi_states: Map<string, KimiScanState>;
    readonly grok_states: Map<string, GrokScanState>;
}

export type ScanStateWarn = (message: string) => void;

function serialize_bucket(
    state: SessionScanState | KimiScanState | GrokScanState,
): SerializedScanBucket {
    const mtimes: Record<string, number> = {};
    // mtimeMs preserved as float so reader's strict === comparison still
    // matches after a round-trip (rounding would mark every file dirty).
    for (const [file, mtime] of state.mtimes) mtimes[file] = mtime;
    const files: SerializedScanBucket["files"] = {};
    for (const [file, entry] of state.files) {
        // Shallow-clone facts, dropping `records` (store already persisted them)
        // and flattening `daily` Map to a record. On reload, reader reuses the
        // entry when mtime is unchanged and re-emits records only if it changes.
        const facts = entry.facts as unknown as { records?: unknown; daily?: Map<string, unknown> };
        const serialized_facts: Record<string, unknown> = { ...facts };
        delete serialized_facts["records"];
        const daily = facts.daily;
        if (daily instanceof Map) {
            serialized_facts["daily"] = Object.fromEntries(daily);
        }
        files[file] = {
            session_id: entry.session_id,
            facts: serialized_facts,
        };
    }
    return { mtimes, files };
}

export function deserialize_bucket(bucket: SerializedScanBucket): {
    mtimes: Map<string, number>;
    files: Map<string, { session_id: string; facts: unknown }>;
} {
    const mtimes = new Map<string, number>();
    for (const [file, mtime] of Object.entries(bucket.mtimes ?? {})) {
        mtimes.set(file, mtime);
    }
    const files = new Map<string, { session_id: string; facts: unknown }>();
    for (const [file, entry] of Object.entries(bucket.files ?? {})) {
        const facts = { ...(entry.facts ?? {}) } as Record<string, unknown>;
        // records restored as []: mtime unchanged -> reader reuses entry, no dup.
        facts["records"] = [];
        const daily_raw = facts["daily"];
        const daily_map = new Map<string, unknown>();
        if (daily_raw && typeof daily_raw === "object") {
            for (const [k, v] of Object.entries(daily_raw as Record<string, unknown>)) {
                daily_map.set(k, v);
            }
        }
        facts["daily"] = daily_map;
        files.set(file, { session_id: entry.session_id, facts });
    }
    return { mtimes, files };
}

export function serialize_state(maps: ScanStateMaps): SerializedScanState {
    const jsonl: Record<string, SerializedScanBucket> = {};
    for (const [key, state] of maps.jsonl_states) jsonl[key] = serialize_bucket(state);
    const kimi: Record<string, SerializedScanBucket> = {};
    for (const [key, state] of maps.kimi_states) kimi[key] = serialize_bucket(state);
    const grok: Record<string, SerializedScanBucket> = {};
    for (const [key, state] of maps.grok_states) grok[key] = serialize_bucket(state);
    const costs: Record<string, { offset: number; size: number }> = {};
    for (const [key, c] of maps.costs_state) costs[key] = c;
    const opencode: Record<string, number> = {};
    for (const [key, v] of maps.opencode_max_updated) opencode[key] = v;
    return {
        costs_state: costs,
        opencode_max_updated: opencode,
        jsonl_states: jsonl,
        kimi_states: kimi,
        grok_states: grok,
    };
}

export async function save_state(
    maps: ScanStateMaps,
    state_path: string,
    on_warn: ScanStateWarn,
): Promise<void> {
    if (!state_path) return;
    try {
        await writeJsonAtomic(state_path, serialize_state(maps));
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        on_warn(`save_state failed: ${msg}`);
    }
}

export async function load_state(
    maps: ScanStateMaps,
    state_path: string,
    on_warn: ScanStateWarn,
): Promise<void> {
    if (!state_path) return;
    let text: string;
    try {
        text = await fs.readFile(state_path, "utf8");
    } catch {
        // Missing or unreadable state -> silent fallback to empty (full rescan).
        return;
    }
    // Clear before attempting restore so any parse/deserialize failure leaves
    // the maps empty (full rescan) rather than a half-populated mix.
    maps.costs_state.clear();
    maps.opencode_max_updated.clear();
    maps.jsonl_states.clear();
    maps.kimi_states.clear();
    maps.grok_states.clear();
    let parsed: unknown;
    try {
        parsed = JSON.parse(text) as unknown;
    } catch {
        on_warn(`load_state: corrupt state file, ignoring`);
        return;
    }
    if (typeof parsed !== "object" || parsed === null) return;
    const s = parsed as Partial<SerializedScanState>;
    try {
        if (s.costs_state) {
            for (const [k, v] of Object.entries(s.costs_state)) {
                if (typeof v.offset === "number" && typeof v.size === "number") {
                    maps.costs_state.set(k, { offset: v.offset, size: v.size });
                }
            }
        }
        if (s.opencode_max_updated) {
            for (const [k, v] of Object.entries(s.opencode_max_updated)) {
                if (typeof v === "number") maps.opencode_max_updated.set(k, v);
            }
        }
        if (s.jsonl_states) {
            for (const [k, bucket] of Object.entries(s.jsonl_states)) {
                maps.jsonl_states.set(k, deserialize_bucket(bucket) as unknown as SessionScanState);
            }
        }
        if (s.kimi_states) {
            for (const [k, bucket] of Object.entries(s.kimi_states)) {
                maps.kimi_states.set(k, deserialize_bucket(bucket) as unknown as KimiScanState);
            }
        }
        if (s.grok_states) {
            for (const [k, bucket] of Object.entries(s.grok_states)) {
                maps.grok_states.set(k, deserialize_bucket(bucket) as unknown as GrokScanState);
            }
        }
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        on_warn(`load_state: failed to restore, ignoring: ${msg}`);
        maps.costs_state.clear();
        maps.opencode_max_updated.clear();
        maps.jsonl_states.clear();
        maps.kimi_states.clear();
        maps.grok_states.clear();
    }
}

import * as fs from "node:fs";
import type { TokenStatsEnv, TokenStatsSession } from "../../../shared/types/token-stats";

// --- Types ---

export interface CostsReadResult {
    sessions: TokenStatsSession[];
    new_offset: number;
    new_size: number;
}

interface RawCostLine {
    session_id?: string;
    model?: string;
    timestamp?: string;
    input_tokens?: number;
    output_tokens?: number;
    cache_read_tokens?: number;
    cache_write_tokens?: number;
}

// --- Internal helpers ---

function read_tail(path: string, offset: number): string {
    const stat = fs.statSync(path);
    if (stat.size <= offset) {
        return "";
    }
    const byte_length = stat.size - offset;
    const fd = fs.openSync(path, "r");
    try {
        const buf = Buffer.alloc(byte_length);
        fs.readSync(fd, buf, 0, byte_length, offset);
        return buf.toString("utf-8");
    } finally {
        fs.closeSync(fd);
    }
}

function parse_lines(raw: string): RawCostLine[] {
    if (!raw) {
        return [];
    }
    const results: RawCostLine[] = [];
    for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) {
            continue;
        }
        try {
            results.push(JSON.parse(trimmed) as RawCostLine);
        } catch {
            // skip malformed lines
        }
    }
    return results;
}

function is_excluded(line: RawCostLine): boolean {
    if (line.session_id === "default") {
        return true;
    }
    if (line.model === "unknown") {
        return true;
    }
    if ((line.input_tokens ?? 0) === 0 && (line.output_tokens ?? 0) === 0) {
        return true;
    }
    return false;
}

// --- Exported function ---

export function read_costs_jsonl(
    path: string,
    env: TokenStatsEnv,
    saved_offset: number,
    saved_size: number,
): CostsReadResult {
    const stat = fs.statSync(path);

    // File unchanged since last read
    if (stat.size === saved_size) {
        return { sessions: [], new_offset: stat.size, new_size: stat.size };
    }

    // File was recreated (truncated)
    const offset = stat.size < saved_offset ? 0 : saved_offset;

    const raw = read_tail(path, offset);
    const lines = parse_lines(raw);
    const valid = lines.filter((l) => !is_excluded(l));

    // Group by session_id
    const groups = new Map<string, RawCostLine[]>();
    for (const line of valid) {
        const sid = line.session_id ?? "";
        let arr = groups.get(sid);
        if (!arr) {
            arr = [];
            groups.set(sid, arr);
        }
        arr.push(line);
    }

    const sessions: TokenStatsSession[] = [];
    for (const [sid, rows] of groups) {
        // Sort by timestamp to pick max and min
        const timestamps = rows
            .map((r) => new Date(r.timestamp ?? 0).getTime())
            .filter((t) => !Number.isNaN(t));

        if (timestamps.length === 0) {
            continue;
        }

        // Pick the row with the latest timestamp for token values
        let latest_idx = 0;
        let latest_ts = 0;
        for (let i = 0; i < rows.length; i++) {
            const ts = new Date(rows[i].timestamp ?? 0).getTime();
            if (!Number.isNaN(ts) && ts >= latest_ts) {
                latest_ts = ts;
                latest_idx = i;
            }
        }
        const latest = rows[latest_idx];

        sessions.push({
            id: sid,
            source: "claude_code",
            env,
            model: latest.model ?? "unknown",
            title: null,
            directory: null,
            input_tokens: latest.input_tokens ?? 0,
            output_tokens: latest.output_tokens ?? 0,
            cache_read_tokens: latest.cache_read_tokens ?? 0,
            cache_write_tokens: latest.cache_write_tokens ?? 0,
            calls: rows.length,
            started_at: Math.min(...timestamps),
            ended_at: Math.max(...timestamps),
        });
    }

    return { sessions, new_offset: stat.size, new_size: stat.size };
}

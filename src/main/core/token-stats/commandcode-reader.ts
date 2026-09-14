import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { calendar_date_of, num } from "./reader-utils";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
    TokenStatsSource,
} from "../../../shared/types/token-stats";

// Command Code is being added to the shared public source/agent unions by t484.
// Keep this reader source-compatible with the t483 base while preserving the
// runtime values that the chained t484 collector/store will validate.
const COMMANDCODE_SOURCE = "commandcode" as unknown as TokenStatsSource;
const COMMANDCODE_AGENT = "commandcode" as unknown as AgentSessionUsageRecord["agent"];

interface UsageSums {
    input_tokens: number;
    output_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    cost_usd: number;
}

export interface CommandCodeFileFacts {
    calls: number;
    model: string | null;
    title: string | null;
    directory: string | null;
    min_ts: number;
    max_ts: number;
    sums: UsageSums;
    daily: Map<string, UsageSums & { calls: number; date: string; model: string }>;
    records: AgentSessionUsageRecord[];
}

export interface CommandCodeScanState {
    /** Every discovered commandcode JSONL file → mtimeMs. */
    mtimes: Map<string, number>;
    /** Files that yielded assistant usage → session id + parsed facts. */
    files: Map<string, { session_id: string; facts: CommandCodeFileFacts }>;
}

export interface CommandCodeScanResult {
    sessions: TokenStatsSessionUpsert[];
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
    new_state: CommandCodeScanState;
    missing: boolean;
    file_unreadable: boolean;
}

export function create_commandcode_scan_state(): CommandCodeScanState {
    return { mtimes: new Map(), files: new Map() };
}

function message_id_from_line(session_id: string, line_number: number, line: string): string {
    const explicit = (() => {
        try {
            const value = JSON.parse(line) as Record<string, unknown>;
            return typeof value["id"] === "string" && value["id"] !== "" ? value["id"] : null;
        } catch {
            return null;
        }
    })();
    if (explicit !== null) return explicit;
    return crypto
        .createHash("sha256")
        .update(`${session_id}:${String(line_number)}:${line}`)
        .digest("hex")
        .slice(0, 32);
}

function timestamp_of(value: unknown): number | null {
    if (typeof value === "number" && Number.isFinite(value)) {
        const milliseconds = value < 1_000_000_000_000 ? value * 1000 : value;
        return milliseconds > 0 ? milliseconds : null;
    }
    if (typeof value !== "string" || value === "") return null;
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) && timestamp > 0 ? timestamp : null;
}

function title_from_meta(project_dir: string, session_id: string): string | null {
    const safe_id = path.basename(session_id);
    try {
        const parsed = JSON.parse(
            fs.readFileSync(path.join(project_dir, `${safe_id}.meta.json`), "utf8"),
        ) as Record<string, unknown>;
        return typeof parsed["title"] === "string" ? parsed["title"] : null;
    } catch {
        // Missing or malformed metadata is explicitly non-blocking; the
        // session remains useful with a null title.
        return null;
    }
}

function session_header_of(line: string): { id: string; cwd: string | null } | null {
    let parsed: Record<string, unknown>;
    try {
        parsed = JSON.parse(line) as Record<string, unknown>;
    } catch {
        return null;
    }
    if (parsed["type"] !== "session" || typeof parsed["id"] !== "string") return null;
    const id = parsed["id"];
    if (id === "") return null;
    const cwd = typeof parsed["cwd"] === "string" && parsed["cwd"] !== "" ? parsed["cwd"] : null;
    return { id, cwd };
}

function empty_sums(): UsageSums {
    return {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_tokens: 0,
        cache_write_tokens: 0,
        cost_usd: 0,
    };
}

function usage_of(value: unknown): UsageSums | null {
    if (typeof value !== "object" || value === null) return null;
    const usage = value as Record<string, unknown>;
    const raw_input = num(usage["inputTokens"]);
    const cache_read_tokens = Math.min(raw_input, num(usage["cacheReadTokens"]));
    const output_tokens = num(usage["outputTokens"]);
    const cache_write_tokens = num(usage["cacheWriteTokens"]);
    const cost_usd =
        typeof usage["costUsd"] === "number" && Number.isFinite(usage["costUsd"])
            ? Math.max(0, usage["costUsd"])
            : 0;
    if (
        raw_input === 0 &&
        output_tokens === 0 &&
        cache_read_tokens === 0 &&
        cache_write_tokens === 0
    ) {
        return null;
    }
    // inputTokens includes cacheReadTokens. Store the non-cached portion in
    // input_tokens and keep cache_read_tokens separate so the store's token
    // expression reconstructs the raw per-turn input without double counting.
    return {
        input_tokens: raw_input - cache_read_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        cost_usd,
    };
}

function parse_commandcode_file(
    content: string,
    project_dir: string,
    env: TokenStatsEnv,
): { session_id: string; facts: CommandCodeFileFacts } | null {
    const lines = content.split(/\r?\n/);
    const header_index = lines.findIndex((line) => line.trim() !== "");
    if (header_index < 0) return null;
    const header = session_header_of(lines[header_index]!.trim());
    if (header === null) return null;

    const title = title_from_meta(project_dir, header.id);
    const sums = empty_sums();
    const daily = new Map<string, UsageSums & { calls: number; date: string; model: string }>();
    const records: AgentSessionUsageRecord[] = [];
    let model: string | null = null;
    let min_ts: number | null = null;
    let max_ts: number | null = null;

    for (let line_number = 0; line_number < lines.length; line_number++) {
        const trimmed = lines[line_number]?.trim() ?? "";
        if (trimmed === "" || line_number === header_index) continue;

        let parsed: Record<string, unknown>;
        try {
            parsed = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
            continue;
        }
        if (parsed["type"] !== "message") continue;
        const message = parsed["message"];
        if (typeof message !== "object" || message === null) continue;
        const message_record = message as Record<string, unknown>;
        if (message_record["role"] !== "assistant") continue;
        const usage = usage_of(parsed["usage"]);
        if (usage === null) continue;
        const timestamp = timestamp_of(parsed["timestamp"] ?? message_record["timestamp"]);
        if (timestamp === null) continue;

        const record_model = typeof parsed["model"] === "string" ? parsed["model"] : "unknown";
        model ??= record_model;
        if (min_ts === null || timestamp < min_ts) min_ts = timestamp;
        if (max_ts === null || timestamp > max_ts) max_ts = timestamp;

        sums.input_tokens += usage.input_tokens;
        sums.output_tokens += usage.output_tokens;
        sums.cache_read_tokens += usage.cache_read_tokens;
        sums.cache_write_tokens += usage.cache_write_tokens;
        sums.cost_usd += usage.cost_usd;

        const date = calendar_date_of(timestamp);
        const daily_key = `${date}|${record_model}`;
        const daily_entry = daily.get(daily_key) ?? {
            date,
            model: record_model,
            input_tokens: 0,
            output_tokens: 0,
            cache_read_tokens: 0,
            cache_write_tokens: 0,
            cost_usd: 0,
            calls: 0,
        };
        daily_entry.input_tokens += usage.input_tokens;
        daily_entry.output_tokens += usage.output_tokens;
        daily_entry.cache_read_tokens += usage.cache_read_tokens;
        daily_entry.cache_write_tokens += usage.cache_write_tokens;
        daily_entry.cost_usd += usage.cost_usd;
        daily_entry.calls++;
        daily.set(daily_key, daily_entry);

        records.push({
            source: COMMANDCODE_SOURCE,
            env,
            agent: COMMANDCODE_AGENT,
            session_id: header.id,
            title,
            directory: header.cwd,
            slug: null,
            version: null,
            parent_session_id: null,
            message_id: message_id_from_line(header.id, line_number, trimmed),
            role: "assistant",
            timestamp,
            model: record_model,
            input_tokens: usage.input_tokens,
            output_tokens: usage.output_tokens,
            cache_read_tokens: usage.cache_read_tokens,
            cache_write_tokens: usage.cache_write_tokens,
        });
    }

    if (min_ts === null || max_ts === null || records.length === 0) return null;
    return {
        session_id: header.id,
        facts: {
            calls: records.length,
            model,
            title,
            directory: header.cwd,
            min_ts,
            max_ts,
            sums,
            daily,
            records,
        },
    };
}

function merge_commandcode_session(
    session_id: string,
    entries: { file: string; facts: CommandCodeFileFacts }[],
    env: TokenStatsEnv,
): {
    upsert: TokenStatsSessionUpsert;
    daily: TokenStatsDailyUpsert[];
    records: AgentSessionUsageRecord[];
} {
    const sorted = [...entries].sort((a, b) => a.file.localeCompare(b.file));
    const sums = empty_sums();
    const daily = new Map<string, TokenStatsDailyUpsert>();
    const records: AgentSessionUsageRecord[] = [];
    let calls = 0;
    let min_ts = Infinity;
    let max_ts = -Infinity;
    let model: string | null = null;
    let title: string | null = null;
    let directory: string | null = null;

    for (const entry of sorted) {
        const facts = entry.facts;
        calls += facts.calls;
        sums.input_tokens += facts.sums.input_tokens;
        sums.output_tokens += facts.sums.output_tokens;
        sums.cache_read_tokens += facts.sums.cache_read_tokens;
        sums.cache_write_tokens += facts.sums.cache_write_tokens;
        sums.cost_usd += facts.sums.cost_usd;
        min_ts = Math.min(min_ts, facts.min_ts);
        max_ts = Math.max(max_ts, facts.max_ts);
        model ??= facts.model;
        title ??= facts.title;
        directory ??= facts.directory;
        records.push(...facts.records);

        for (const day of facts.daily.values()) {
            const key = `${day.date}|${day.model}`;
            const merged = daily.get(key) ?? {
                id: session_id,
                source: COMMANDCODE_SOURCE,
                env,
                date: day.date,
                model: day.model,
                input_tokens: 0,
                output_tokens: 0,
                cache_read_tokens: 0,
                cache_write_tokens: 0,
                calls: 0,
            };
            merged.input_tokens += day.input_tokens;
            merged.output_tokens += day.output_tokens;
            merged.cache_read_tokens += day.cache_read_tokens;
            merged.cache_write_tokens += day.cache_write_tokens;
            merged.calls += day.calls;
            daily.set(key, merged);
        }
    }

    for (const record of records) {
        record.title = title;
        record.directory = directory;
    }
    return {
        upsert: {
            id: session_id,
            source: COMMANDCODE_SOURCE,
            env,
            model,
            title,
            directory,
            input_tokens: sums.input_tokens,
            output_tokens: sums.output_tokens,
            cache_read_tokens: sums.cache_read_tokens,
            cache_write_tokens: sums.cache_write_tokens,
            calls,
            started_at: min_ts,
            ended_at: max_ts,
        },
        daily: [...daily.values()],
        records,
    };
}

function commandcode_files(projects_dir: string): {
    files: string[];
    missing: boolean;
    unreadable: boolean;
} {
    let projects: fs.Dirent[];
    try {
        projects = fs.readdirSync(projects_dir, { withFileTypes: true });
    } catch {
        return { files: [], missing: true, unreadable: false };
    }

    const files: string[] = [];
    let unreadable = false;
    for (const project of projects) {
        if (!project.isDirectory()) continue;
        const project_dir = path.join(projects_dir, project.name);
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(project_dir, { withFileTypes: true });
        } catch {
            unreadable = true;
            continue;
        }
        for (const entry of entries) {
            if (
                entry.isFile() &&
                entry.name.endsWith(".jsonl") &&
                !entry.name.endsWith(".checkpoints.jsonl")
            ) {
                files.push(path.join(project_dir, entry.name));
            }
        }
    }
    files.sort();
    return { files, missing: false, unreadable };
}

export function scan_commandcode_jsonls(
    projects_dir: string,
    env: TokenStatsEnv,
    prev: CommandCodeScanState,
): CommandCodeScanResult {
    const discovered = commandcode_files(projects_dir);
    if (discovered.missing) {
        return {
            sessions: [],
            daily: [],
            records: [],
            new_state: prev,
            missing: true,
            file_unreadable: false,
        };
    }

    const found = discovered.files;
    const found_set = new Set(found);
    const new_state = create_commandcode_scan_state();
    const dirty_sessions = new Set<string>();
    for (const [file, entry] of prev.files) {
        if (!found_set.has(file)) dirty_sessions.add(entry.session_id);
    }

    let file_unreadable = discovered.unreadable;
    for (const file of found) {
        let stat: fs.Stats;
        try {
            stat = fs.statSync(file);
        } catch {
            file_unreadable = true;
            continue;
        }
        const old_entry = prev.files.get(file);
        if (prev.mtimes.get(file) === stat.mtimeMs) {
            new_state.mtimes.set(file, stat.mtimeMs);
            if (old_entry) new_state.files.set(file, old_entry);
            continue;
        }
        if (old_entry) dirty_sessions.add(old_entry.session_id);

        let content: string;
        try {
            content = fs.readFileSync(file, "utf8");
        } catch {
            file_unreadable = true;
            continue;
        }
        const parsed = parse_commandcode_file(content, path.dirname(file), env);
        new_state.mtimes.set(file, stat.mtimeMs);
        if (parsed === null) continue;
        new_state.files.set(file, parsed);
        dirty_sessions.add(parsed.session_id);
    }

    const by_session = new Map<string, { file: string; facts: CommandCodeFileFacts }[]>();
    for (const [file, entry] of new_state.files) {
        const list = by_session.get(entry.session_id) ?? [];
        list.push({ file, facts: entry.facts });
        by_session.set(entry.session_id, list);
    }

    const sessions: TokenStatsSessionUpsert[] = [];
    const daily: TokenStatsDailyUpsert[] = [];
    const records: AgentSessionUsageRecord[] = [];
    for (const session_id of [...dirty_sessions].sort()) {
        const entries = by_session.get(session_id);
        if (!entries || entries.length === 0) continue;
        const merged = merge_commandcode_session(session_id, entries, env);
        sessions.push(merged.upsert);
        daily.push(...merged.daily);
        records.push(...merged.records);
    }
    return {
        sessions,
        daily,
        records,
        new_state,
        missing: false,
        file_unreadable,
    };
}

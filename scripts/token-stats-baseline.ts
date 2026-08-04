import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { create_token_stats_store } from "../src/main/core/token-stats/token-stats-store";
import type {
    AgentSessionUsageRecord,
    TokenStatsDailyUpsert,
    TokenStatsEnv,
    TokenStatsSessionUpsert,
} from "../src/shared/types/token-stats";
import {
    prepareBarDataFromBuckets,
    prepareBarDataFromHourBuckets,
    prepareHeatmapFromCells,
} from "../src/renderer/lib/token-stats/chart-data";
import { sessionRowsFromSessions } from "../src/renderer/lib/token-stats/aggregate";

const RECORD_COUNT = 600_000;
const SEED = 0x5eed_2026;
const DAY_MS = 24 * 60 * 60 * 1000;
const WINDOW_END = Date.UTC(2026, 7, 1, 0, 0, 0, 0);
const WINDOW_START = WINDOW_END - 30 * DAY_MS;
const TIMESTAMP_STEP_MS = 1_234_567;
const BATCH_SIZE = 10_000;

const SOURCES = ["claude_code", "opencode", "kimi_code"] as const;
const AGENTS = ["claude-code", "opencode", "kimi-code"] as const;
const ENVS = ["win", "wsl"] as const;
const MODELS = ["model-0", "model-1", "model-2", "model-3", "model-4", "model-5"];

export interface BaselineQueryReport {
    name: string;
    elapsed_ms: number;
    row_count: number;
    serialized_bytes: number;
}

export interface BaselineScenarioReport {
    range: "24h" | "7d" | "30d";
    agent: "all" | (typeof AGENTS)[number];
    platform: "all" | TokenStatsEnv;
    query: BaselineQueryReport[];
    renderer_conversion_ms: number;
    renderer_output_bytes: number;
    total_ms: number;
}

export interface BaselineReport {
    schema_version: 1;
    generated_at: string;
    seed: number;
    synthetic_record_count: number;
    scenarios: BaselineScenarioReport[];
}

type Scenario = Omit<
    BaselineScenarioReport,
    "query" | "renderer_conversion_ms" | "renderer_output_bytes" | "total_ms"
>;

type QueryValue = unknown[];

function json_bytes(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}

function source_for_agent(agent: Scenario["agent"]): string | undefined {
    if (agent === "all") return undefined;
    return agent.replace("-", "_");
}

function record_for(index: number): AgentSessionUsageRecord {
    const source_index = (index + SEED) % SOURCES.length;
    const source = SOURCES[source_index] ?? "claude_code";
    const agent = AGENTS[source_index] ?? "claude-code";
    const env = ENVS[(index + Math.floor(index / 17)) % ENVS.length] ?? "win";
    const timestamp = WINDOW_START + ((index * TIMESTAMP_STEP_MS + SEED) % (30 * DAY_MS));
    const session_number = index % 10_000;
    const model = MODELS[(index + Math.floor(index / 31)) % MODELS.length] ?? "model-0";
    const input_tokens = 100 + ((index * 17 + SEED) % 900);
    const output_tokens = 20 + ((index * 7 + SEED) % 400);
    const cache_read_tokens = (index * 11 + SEED) % 250;
    const cache_write_tokens = (index * 13 + SEED) % 80;

    return {
        source,
        env,
        session_id: `synthetic-session-${String(session_number)}`,
        title: null,
        directory: null,
        slug: null,
        version: null,
        parent_session_id: null,
        message_id: `synthetic-message-${String(index)}`,
        role: "assistant",
        timestamp,
        model,
        input_tokens,
        output_tokens,
        cache_read_tokens,
        cache_write_tokens,
        agent,
    };
}

export function generate_synthetic_records(count: number): AgentSessionUsageRecord[] {
    if (!Number.isInteger(count) || count < 0) {
        throw new Error("synthetic record count must be a non-negative integer");
    }
    return Array.from({ length: count }, (_, index) => record_for(index));
}

interface DerivedUsage {
    sessions: Map<string, TokenStatsSessionUpsert>;
    daily: Map<string, TokenStatsDailyUpsert>;
}

function add_derived_usage(derived: DerivedUsage, record: AgentSessionUsageRecord): void {
    const session_key = `${record.session_id}|${record.source}|${record.env}`;
    const session = derived.sessions.get(session_key);
    if (session) {
        session.input_tokens = (session.input_tokens ?? 0) + record.input_tokens;
        session.output_tokens = (session.output_tokens ?? 0) + record.output_tokens;
        session.cache_read_tokens = (session.cache_read_tokens ?? 0) + record.cache_read_tokens;
        session.cache_write_tokens = (session.cache_write_tokens ?? 0) + record.cache_write_tokens;
        session.calls = (session.calls ?? 0) + 1;
        session.started_at = Math.min(session.started_at, record.timestamp);
        session.ended_at = Math.max(session.ended_at, record.timestamp);
    } else {
        derived.sessions.set(session_key, {
            id: record.session_id,
            source: record.source,
            env: record.env,
            model: record.model,
            title: null,
            directory: null,
            input_tokens: record.input_tokens,
            output_tokens: record.output_tokens,
            cache_read_tokens: record.cache_read_tokens,
            cache_write_tokens: record.cache_write_tokens,
            calls: 1,
            started_at: record.timestamp,
            ended_at: record.timestamp,
        });
    }

    const date = new Date(record.timestamp).toISOString().slice(0, 10);
    const daily_key = `${session_key}|${date}|${record.model}`;
    const daily = derived.daily.get(daily_key);
    if (daily) {
        daily.input_tokens += record.input_tokens;
        daily.output_tokens += record.output_tokens;
        daily.cache_read_tokens += record.cache_read_tokens;
        daily.cache_write_tokens += record.cache_write_tokens;
        daily.calls += 1;
    } else {
        derived.daily.set(daily_key, {
            id: record.session_id,
            source: record.source,
            env: record.env,
            date,
            model: record.model,
            input_tokens: record.input_tokens,
            output_tokens: record.output_tokens,
            cache_read_tokens: record.cache_read_tokens,
            cache_write_tokens: record.cache_write_tokens,
            calls: 1,
        });
    }
}

function load_synthetic_records(
    store: ReturnType<typeof create_token_stats_store>,
    count: number,
): void {
    const derived: DerivedUsage = {
        sessions: new Map(),
        daily: new Map(),
    };
    for (let offset = 0; offset < count; offset += BATCH_SIZE) {
        const size = Math.min(BATCH_SIZE, count - offset);
        const records = Array.from({ length: size }, (_, index) => record_for(offset + index));
        store.upsert_records(records);
        for (const record of records) {
            add_derived_usage(derived, record);
        }
    }
    store.upsert_sessions([...derived.sessions.values()], [...derived.daily.values()]);
}

function query_report<T extends QueryValue>(
    reports: BaselineQueryReport[],
    name: string,
    query: () => T,
): T {
    const started_at = performance.now();
    const value = query();
    reports.push({
        name,
        elapsed_ms: round_ms(performance.now() - started_at),
        row_count: value.length,
        serialized_bytes: json_bytes(value),
    });
    return value;
}

function round_ms(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function range_for(range: Scenario["range"]): { start: number; end: number } {
    const duration = range === "24h" ? DAY_MS : range === "7d" ? 7 * DAY_MS : 30 * DAY_MS;
    return { start: WINDOW_END - duration, end: WINDOW_END };
}

function run_scenario(
    store: ReturnType<typeof create_token_stats_store>,
    scenario: Scenario,
): BaselineScenarioReport {
    const total_started_at = performance.now();
    const range = range_for(scenario.range);
    const query_reports: BaselineQueryReport[] = [];
    const source = source_for_agent(scenario.agent);
    const env = scenario.platform === "all" ? undefined : scenario.platform;
    const agent_filter = scenario.agent === "all" ? {} : { agent: scenario.agent };
    const env_filter = env === undefined ? {} : { env };
    const source_filter = source === undefined ? {} : { source };
    const records_limit = scenario.range === "24h" ? 50_000 : 100_000;
    const records = query_report(query_reports, "records", () =>
        store.query_records({
            ...agent_filter,
            ...env_filter,
            start: range.start,
            end: range.end,
            limit: records_limit,
        }),
    );
    const heatmap = query_report(query_reports, "heatmap", () =>
        store.query_heatmap({
            ...agent_filter,
            ...env_filter,
            start: range.start,
            end: range.end,
        }),
    );
    const buckets = query_report(query_reports, "buckets", () =>
        store.query_buckets({
            ...source_filter,
            ...env_filter,
            from_date: new Date(range.start).toISOString().slice(0, 10),
            to_date: new Date(range.end).toISOString().slice(0, 10),
        }),
    );
    const sessions = query_report(query_reports, "sessions", () =>
        store.query_sessions({ ...source_filter, ...env_filter, limit: 500 }),
    );
    const hour_buckets = query_report(query_reports, "hour_buckets", () =>
        store.query_hour_buckets({
            ...agent_filter,
            ...env_filter,
            start: range.start,
            end: range.end,
        }),
    );
    if (scenario.range === "24h") {
        query_report(query_reports, "rollup", () =>
            store.query_range_rollup({
                ...agent_filter,
                ...env_filter,
                start: range.start,
                end: range.end,
            }),
        );
    }

    const conversion_started_at = performance.now();
    const day_data = prepareBarDataFromBuckets(buckets, "tokens", range.start, range.end, "dark");
    const hour_data = prepareBarDataFromHourBuckets(
        hour_buckets,
        "tokens",
        range.start,
        range.end,
        "dark",
    );
    const heatmap_data = prepareHeatmapFromCells(heatmap, "tokens");
    const session_rows = sessionRowsFromSessions(sessions);
    const renderer_output = { day_data, hour_data, heatmap_data, session_rows, records };

    return {
        ...scenario,
        query: query_reports,
        renderer_conversion_ms: round_ms(performance.now() - conversion_started_at),
        renderer_output_bytes: json_bytes(renderer_output),
        total_ms: round_ms(performance.now() - total_started_at),
    };
}

export function run_baseline(record_count = RECORD_COUNT): BaselineReport {
    const db_dir = mkdtempSync(join(tmpdir(), "omni-token-stats-baseline-"));
    const db_path = join(db_dir, "token-stats.sqlite");
    const store = create_token_stats_store(db_path);
    try {
        load_synthetic_records(store, record_count);
        const scenarios: Scenario[] = [];
        for (const range of ["24h", "7d", "30d"] as const) {
            for (const agent of ["all", ...AGENTS] as const) {
                for (const platform of ["all", ...ENVS] as const) {
                    scenarios.push({ range, agent, platform });
                }
            }
        }
        return {
            schema_version: 1,
            generated_at: new Date().toISOString(),
            seed: SEED,
            synthetic_record_count: record_count,
            scenarios: scenarios.map((scenario) => run_scenario(store, scenario)),
        };
    } finally {
        store.close();
        rmSync(db_dir, { recursive: true, force: true });
    }
}

function parse_args(args: string[]): { record_count: number; output_path?: string } {
    let record_count = RECORD_COUNT;
    let output_path: string | undefined;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        if (arg === "--records") {
            const value = args[index + 1];
            record_count = Number(value);
            index += 1;
        } else if (arg === "--output") {
            output_path = args[index + 1];
            index += 1;
        } else if (arg === "--help") {
            process.stdout.write(
                "Usage: tsx scripts/token-stats-baseline.ts [--records N] [--output PATH]\n",
            );
            process.exit(0);
        } else {
            throw new Error(`unknown argument: ${String(arg)}`);
        }
    }
    return output_path === undefined ? { record_count } : { record_count, output_path };
}

export function main(args = process.argv.slice(2)): void {
    const { record_count, output_path } = parse_args(args);
    const report = run_baseline(record_count);
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (output_path) {
        writeFileSync(output_path, text, "utf8");
    }
    process.stdout.write(text);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main();
}

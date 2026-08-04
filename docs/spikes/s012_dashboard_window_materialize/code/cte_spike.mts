import Database from "better-sqlite3";

const db = new Database(":memory:");
db.exec(`
CREATE TABLE token_stats_hour_rollup (
    source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
    hour_start INTEGER NOT NULL, model TEXT NOT NULL, directory TEXT,
    agent TEXT NOT NULL, calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (source, env, session_id, hour_start, model, directory, agent)
);
CREATE TABLE token_stats_records (
    session_id TEXT NOT NULL, message_id TEXT NOT NULL, source TEXT NOT NULL,
    env TEXT NOT NULL, model TEXT, directory TEXT, timestamp INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    agent TEXT
);
CREATE INDEX idx_records_ts ON token_stats_records(timestamp);
CREATE INDEX idx_records_env_ts ON token_stats_records(env, timestamp DESC);
CREATE INDEX idx_records_session_ts ON token_stats_records(source, env, session_id, timestamp DESC);
`);

const HOUR = 3600 * 1000;
const start = new Date("2026-07-10T00:00:00Z").getTime();
const end = start + 24 * HOUR;
const H = (t: number) => t - ((t + 28800000) % 3600000);

const ins_rollup = db.prepare(
    "INSERT INTO token_stats_hour_rollup VALUES (@source,@env,@session_id,@hour_start,@model,@directory,@agent,@calls,@input,@output,@cr,@cw,@updated)",
);
for (const s of ["s1", "s2", "s3"]) {
    for (const h of [0, 1, 2]) {
        const hs = H(start) + h * HOUR;
        for (const m of ["sonnet", "opus"]) {
            ins_rollup.run({
                source: "claude_code",
                env: "win",
                session_id: s,
                hour_start: hs,
                model: m,
                directory: "/p" + s,
                agent: "claude-code",
                calls: 2,
                input: 100,
                output: 50,
                cr: 10,
                cw: 5,
                updated: hs,
            });
        }
    }
}
const ins_rec = db.prepare(
    "INSERT INTO token_stats_records VALUES (@session_id,@message_id,@source,@env,@model,@directory,@timestamp,@input,@output,@cr,@cw,@agent)",
);
for (const s of ["s1", "s2", "s3"]) {
    ins_rec.run({
        session_id: s,
        message_id: s + "-e0",
        source: "claude_code",
        env: "win",
        model: "sonnet",
        directory: "/p" + s,
        timestamp: start + 10 * 60 * 1000,
        input: 5,
        output: 2,
        cr: 0,
        cw: 0,
        agent: "claude-code",
    });
    ins_rec.run({
        session_id: s,
        message_id: s + "-e1",
        source: "claude_code",
        env: "win",
        model: "sonnet",
        directory: "/p" + s,
        timestamp: end - 10 * 60 * 1000,
        input: 3,
        output: 1,
        cr: 0,
        cw: 0,
        agent: "claude-code",
    });
}

const window_union = (s: number, e: number) => {
    const hs = s - ((s + 28800000) % 3600000);
    const full_start = hs === s ? hs : hs + 3600000;
    const full_end = e - ((e + 28800000) % 3600000);
    const params = { start: s, end: e, full_start, full_end };
    const has_full = full_start < full_end;
    const rollup_part = has_full
        ? "SELECT source, env, session_id, model, directory, agent, hour_start, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM token_stats_hour_rollup WHERE hour_start >= @full_start AND hour_start < @full_end"
        : "SELECT source, env, session_id, model, directory, agent, 0 AS hour_start, 0 AS calls, 0 AS input_tokens, 0 AS output_tokens, 0 AS cache_read_tokens, 0 AS cache_write_tokens FROM token_stats_records WHERE 0";
    const records_part = has_full
        ? "SELECT source, env, session_id, model, directory, agent, (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start, 1 AS calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM token_stats_records WHERE ((timestamp >= @start AND timestamp < @full_start) OR (timestamp >= @full_end AND timestamp < @end))"
        : "SELECT source, env, session_id, model, directory, agent, (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start, 1 AS calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM token_stats_records WHERE (timestamp >= @start AND timestamp < @end)";
    return { sql: `(${rollup_part} UNION ALL ${records_part})`, params };
};

const u = window_union(start, end);

console.log("=== A. STATUS QUO: independent statements over window_union ===");
const stmts = {
    rollup: `SELECT source, env, model, directory, session_id, SUM(calls) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens FROM ${u.sql} AS w GROUP BY source, env, session_id, model, directory, agent`,
    metric: `SELECT hour_start, model, SUM(calls) AS calls, SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens FROM ${u.sql} AS w GROUP BY hour_start, model`,
    session_b: `SELECT hour_start, COALESCE(directory, '(unknown)') AS directory, COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions FROM ${u.sql} AS w GROUP BY hour_start, COALESCE(directory, '(unknown)')`,
    page_total: `SELECT COUNT(*) AS total FROM (SELECT source, env, session_id FROM ${u.sql} AS w GROUP BY source, env, session_id)`,
    heatmap: `SELECT CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday, CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour, SUM(calls) AS calls, COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions, SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens FROM ${u.sql} AS w GROUP BY weekday, hour`,
};
for (const [name, sql] of Object.entries(stmts)) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(u.params);
    const scans = plan
        .filter((r) => String((r as { detail: string }).detail).includes("SCAN"))
        .map((r) => (r as { detail: string }).detail);
    console.log(`${name}: ${scans.join(" ; ")}`);
}

console.log("\n=== B. MATERIALIZED CTE: one window materialization, regions derive ===");
const cte_body = `WITH window_rows AS MATERIALIZED (SELECT source, env, session_id, model, directory, agent, hour_start, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM ${u.sql}) `;
const cte_stmts = {
    rollup: `${cte_body} SELECT source, env, model, directory, session_id, SUM(calls) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens FROM window_rows GROUP BY source, env, session_id, model, directory, agent`,
    metric: `${cte_body} SELECT hour_start, model, SUM(calls) AS calls, SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens FROM window_rows GROUP BY hour_start, model`,
    session_b: `${cte_body} SELECT hour_start, COALESCE(directory, '(unknown)') AS directory, COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions FROM window_rows GROUP BY hour_start, COALESCE(directory, '(unknown)')`,
    page_total: `${cte_body} SELECT COUNT(*) AS total FROM (SELECT source, env, session_id FROM window_rows GROUP BY source, env, session_id)`,
    heatmap: `${cte_body} SELECT CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday, CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour, SUM(calls) AS calls, COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions, SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens FROM window_rows GROUP BY weekday, hour`,
};
let base_reads = 0;
for (const [name, sql] of Object.entries(cte_stmts)) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(u.params);
    const detail = plan.map((r) => (r as { detail: string }).detail);
    const base = detail.filter((d) => d.includes("hour_rollup") || d.includes("records"));
    const wr = detail.filter((d) => d.includes("window_rows"));
    base_reads += base.length;
    console.log(`${name}: base=[${base.join(" | ")}] window_rows=[${wr.join(" | ")}]`);
}
console.log(`\nB total base reads (1 window materialization = 1): ${base_reads}`);

const plain = db.prepare(stmts.rollup).all(u.params) as Record<string, unknown>[];
const cte = db.prepare(cte_stmts.rollup).all(u.params) as Record<string, unknown>[];
console.log("rollup rows equal:", JSON.stringify(plain) === JSON.stringify(cte));

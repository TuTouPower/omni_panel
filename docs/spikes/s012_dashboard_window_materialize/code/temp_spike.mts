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
    env TEXT NOT NULL, title TEXT, model TEXT, directory TEXT, timestamp INTEGER NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    agent TEXT
);
CREATE INDEX idx_records_ts ON token_stats_records(timestamp);
CREATE INDEX idx_records_env_ts ON token_stats_records(env, timestamp DESC);
CREATE INDEX idx_records_session_ts ON token_stats_records(source, env, session_id, timestamp DESC);
CREATE TABLE token_stats_meta (id INTEGER PRIMARY KEY CHECK (id = 1), hour_rollup_ready INTEGER NOT NULL DEFAULT 0);
INSERT INTO token_stats_meta VALUES (1, 1);
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
    "INSERT INTO token_stats_records (session_id, message_id, source, env, title, model, directory, timestamp, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, agent) VALUES (@session_id,@message_id,@source,@env,@title,@model,@directory,@timestamp,@input,@output,@cr,@cw,@agent)",
);
const recs = [
    ["s1", "s1-a", "title1a", "/p1", start + 10 * 60 * 1000, 5],
    ["s1", "s1-b", "title1b", "/p1", start + 20 * 60 * 1000, 7],
    ["s2", "s2-a", "title2", "/p2", start + 15 * 60 * 1000, 6],
    ["s3", "s3-a", "title3", "/p3", end - 10 * 60 * 1000, 3],
] as const;
for (const [sid, mid, title, dir, ts, tok] of recs) {
    ins_rec.run({
        session_id: sid,
        message_id: mid,
        source: "claude_code",
        env: "win",
        title,
        model: "sonnet",
        directory: dir,
        timestamp: ts,
        input: tok,
        output: 0,
        cr: 0,
        cw: 0,
        agent: "claude-code",
    });
}

// records window schema has no title column in reality; simulate with a parallel table for clarity
db.exec(`CREATE TABLE rec_meta (session_id TEXT, title TEXT, directory TEXT, ts INTEGER)`);
const ins_meta = db.prepare("INSERT INTO rec_meta VALUES (?,?,?,?)");
for (const [sid, , title, dir, ts] of recs) ins_meta.run(sid, title, dir, ts);

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

console.log("=== C. TEMP TABLE: one window materialization, regions read temp ===");
const params = { ...u.params, start, end };
// Step 1: materialize window once into a temp table
db.prepare(`DROP TABLE IF EXISTS window_rows`).run();
db.prepare(
    `CREATE TEMP TABLE window_rows AS
    SELECT source, env, session_id, model, directory, agent, hour_start,
           calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
    FROM ${u.sql}`,
).run(u.params);
console.log("materialize plan:");
for (const r of db
    .prepare(
        `EXPLAIN QUERY PLAN SELECT source, env, session_id, model, directory, agent, hour_start, calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens FROM ${u.sql}`,
    )
    .all(u.params)) {
    console.log("  " + (r as { detail: string }).detail);
}

const region_sql = {
    rollup: `SELECT source, env, model, directory, session_id, SUM(calls) AS calls, SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens, SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens FROM window_rows GROUP BY source, env, session_id, model, directory, agent`,
    metric: `SELECT hour_start, model, SUM(calls) AS calls, SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens FROM window_rows GROUP BY hour_start, model`,
    session_b: `SELECT hour_start, COALESCE(directory, '(unknown)') AS directory, COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions FROM window_rows GROUP BY hour_start, COALESCE(directory, '(unknown)')`,
    page_total: `SELECT COUNT(*) AS total FROM (SELECT source, env, session_id FROM window_rows GROUP BY source, env, session_id)`,
    heatmap: `SELECT CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday, CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour, SUM(calls) AS calls, COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions, SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens FROM window_rows GROUP BY weekday, hour`,
};
for (const [name, sql] of Object.entries(region_sql)) {
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
    const detail = plan.map((r) => (r as { detail: string }).detail);
    console.log(`${name}: ${detail.join(" | ")}`);
}

console.log("\n=== D. latest-per-session title/directory/started_at/ended_at (p028) ===");
// Old: N correlated subqueries. New: one windowed latest-per-group query.
const latest_sql = `
    SELECT source, env, session_id, title, directory, timestamp AS last_ts
    FROM (
        SELECT source, env, session_id, title, directory, timestamp,
               ROW_NUMBER() OVER (PARTITION BY source, env, session_id ORDER BY timestamp DESC) AS rn
        FROM token_stats_records
        WHERE timestamp >= @start AND timestamp < @end
    ) WHERE rn = 1`;
console.log("latest-per-session plan:");
for (const r of db.prepare(`EXPLAIN QUERY PLAN ${latest_sql}`).all({ start, end })) {
    console.log("  " + (r as { detail: string }).detail);
}
const latest = db.prepare(latest_sql).all({ start, end });
console.log("latest rows:", JSON.stringify(latest));

console.log("\n=== E. single pass: temp table + all regions in one request ===");
// Combined: materialize once, derive every region (the intended t201 shape).
db.prepare(`DROP TABLE IF EXISTS window_rows`).run();
db.prepare(
    `CREATE TEMP TABLE window_rows AS
    SELECT source, env, session_id, model, directory, agent, hour_start,
           calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
    FROM ${u.sql}`,
).run(u.params);
const combined = [
    { name: "rollup", sql: region_sql.rollup },
    { name: "metric_buckets", sql: region_sql.metric },
    { name: "session_buckets", sql: region_sql.session_b },
    { name: "session_page_total", sql: region_sql.page_total },
    { name: "heatmap", sql: region_sql.heatmap },
] as const;
for (const { name, sql } of combined) {
    const rows = db.prepare(sql).all();
    console.log(`${name}: ${rows.length} rows`);
}

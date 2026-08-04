/**
 * s008 spike: 最小持久聚合粒度实验（t192 前置 UNVERIFIED-SPIKE）
 *
 * 目的：比较三种候选聚合粒度，选择能覆盖 dashboard 全部维度、
 * 保持现有统计语义的最小持久聚合方案。
 *
 * 方案：
 *   A. 复用现有 day/session 表（token_stats_daily 按 UTC 日+model，
 *      token_stats_sessions 按 session）
 *   B. hour 聚合：per (source, env, hour_start, model, directory)，不含 session
 *   C. session-hour 聚合：per (source, env, session_id, hour_start, model, directory)
 *
 * 测量：
 *   1. 合成 records 后三张候选表的行数（vs records 行数）
 *   2. 从聚合表重建 dashboard 各区域（summary/chart/heatmap/sessions）所需的
 *      最小查询数，与 records 重算结果对比是否一致
 *   3. title/directory「窗口内最新」语义能否由聚合表保留
 */
import Database from "better-sqlite3";

const db = new Database(":memory:");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE token_stats_records (
    source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
    title TEXT, directory TEXT, message_id TEXT NOT NULL, role TEXT NOT NULL,
    timestamp INTEGER NOT NULL, model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL DEFAULT 0, output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0, cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    agent TEXT NOT NULL,
    PRIMARY KEY (message_id, source, env)
);
`);

// ---- 合成数据：24h 窗口内 200 个 session × 平均 25 条 = 5000 条 records ----
const START = 1_750_000_000_000;
const END = START + 24 * 3600_000;
const MODELS = ["sonnet", "opus", "haiku", "kimi", "gpt"];
const DIRS = ["/proj/a", "/proj/b", "/proj/c"];
const AGENTS = ["claude-code", "opencode", "kimi-code"];
const SOURCES: Record<string, string> = {
    "claude-code": "claude_code",
    opencode: "opencode",
    "kimi-code": "kimi_code",
};
const ENVS = ["win", "wsl"];

const upsert_record = db.prepare(`
INSERT INTO token_stats_records (
    source, env, session_id, title, directory, message_id, role, timestamp,
    model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, agent
) VALUES (@source, @env, @session_id, @title, @directory, @message_id, @role,
    @timestamp, @model, @input_tokens, @output_tokens, @cache_read_tokens,
    @cache_write_tokens, @agent)
`);

const tx = db.transaction(() => {
    let mid = 0;
    for (let s = 0; s < 200; s += 1) {
        const session_id = `session-${String(s)}`;
        const agent = AGENTS[s % AGENTS.length]!;
        const source = SOURCES[agent]!;
        const env = ENVS[s % ENVS.length]!;
        const directory = DIRS[s % DIRS.length]!;
        const title = `Session ${String(s)}`;
        const count = 5 + (s % 40); // 5..44 条
        for (let i = 0; i < count; i += 1) {
            const model = MODELS[i % MODELS.length]!;
            upsert_record.run({
                source,
                env,
                session_id,
                title,
                directory,
                message_id: `m-${String(mid++)}`,
                role: "assistant",
                timestamp: START + ((s * 37 + i * 11) % (END - START)),
                model,
                input_tokens: 100 + i * 10,
                output_tokens: 20 + i,
                cache_read_tokens: i % 3 === 0 ? 500 : 0,
                cache_write_tokens: 0,
                agent,
            });
        }
    }
});
tx();

const record_count = (
    db.prepare("SELECT COUNT(*) AS c FROM token_stats_records").get() as { c: number }
).c;

// ---- 候选聚合表 ----
db.exec(`
CREATE TABLE agg_daily (
    source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
    date TEXT NOT NULL, model TEXT NOT NULL, directory TEXT,
    calls INTEGER NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
    PRIMARY KEY (source, env, session_id, date, model)
);
CREATE TABLE agg_hour (
    source TEXT NOT NULL, env TEXT NOT NULL, hour_start INTEGER NOT NULL,
    model TEXT NOT NULL, directory TEXT,
    calls INTEGER NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
    sessions INTEGER NOT NULL,
    PRIMARY KEY (source, env, hour_start, model, directory)
);
CREATE TABLE agg_session_hour (
    source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
    hour_start INTEGER NOT NULL, model TEXT NOT NULL, directory TEXT,
    calls INTEGER NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
    PRIMARY KEY (source, env, session_id, hour_start, model)
);
CREATE TABLE agg_session (
    source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
    model TEXT NOT NULL, directory TEXT, title TEXT,
    calls INTEGER NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
    cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
    started_at INTEGER NOT NULL, ended_at INTEGER NOT NULL,
    PRIMARY KEY (source, env, session_id, model)
);
`);

// UTC+8 整点小时桶
const hour_start = (ts: number) => ts - ((ts + 28800000) % 3600000);
const day_start = (ts: number) => ts - ((ts + 28800000) % 86400000);
const day_str = (ts: number) => {
    const d = new Date(ts + 8 * 3600000);
    return `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
};

// ---- 方案 A：daily 表（UTC 日粒度，按 session+model）----
db.exec("DELETE FROM agg_daily");
{
    const ins = db.prepare(`
        INSERT OR REPLACE INTO agg_daily (
            source, env, session_id, date, model, directory,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        ) VALUES (@source, @env, @session_id, @date, @model, @directory,
            @calls, @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens)
    `);
    const rows = db
        .prepare(
            `
        SELECT source, env, session_id, model, directory,
            COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens,
            MIN(timestamp) AS min_ts
        FROM token_stats_records GROUP BY source, env, session_id, model, directory
    `,
        )
        .all() as {
        source: string;
        env: string;
        session_id: string;
        model: string;
        directory: string | null;
        calls: number;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_write_tokens: number;
        min_ts: number;
    }[];
    for (const r of rows) {
        ins.run({
            source: r.source,
            env: r.env,
            session_id: r.session_id,
            date: day_str(r.min_ts),
            model: r.model,
            directory: r.directory,
            calls: r.calls,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens,
            cache_write_tokens: r.cache_write_tokens,
        });
    }
}

// ---- 方案 B：hour 聚合（不含 session）----
db.exec("DELETE FROM agg_hour");
{
    const ins = db.prepare(`
        INSERT OR REPLACE INTO agg_hour (
            source, env, hour_start, model, directory,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, sessions
        ) VALUES (@source, @env, @hour_start, @model, @directory,
            @calls, @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens, @sessions)
    `);
    const rows = db
        .prepare(
            `
        SELECT source, env, (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
            model, directory,
            COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens,
            COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions
        FROM token_stats_records GROUP BY source, env, hour_start, model, directory
    `,
        )
        .all() as {
        source: string;
        env: string;
        hour_start: number;
        model: string;
        directory: string | null;
        calls: number;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_write_tokens: number;
        sessions: number;
    }[];
    for (const r of rows) {
        ins.run({ ...r, directory: r.directory ?? "(unknown)" });
    }
}

// ---- 方案 C：session-hour 聚合 ----
db.exec("DELETE FROM agg_session_hour");
{
    const ins = db.prepare(`
        INSERT OR REPLACE INTO agg_session_hour (
            source, env, session_id, hour_start, model, directory,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        ) VALUES (@source, @env, @session_id, @hour_start, @model, @directory,
            @calls, @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens)
    `);
    const rows = db
        .prepare(
            `
        SELECT source, env, session_id, (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
            model, directory,
            COUNT(*) AS calls,
            SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens
        FROM token_stats_records GROUP BY source, env, session_id, hour_start, model, directory
    `,
        )
        .all() as {
        source: string;
        env: string;
        session_id: string;
        hour_start: number;
        model: string;
        directory: string | null;
        calls: number;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_write_tokens: number;
    }[];
    for (const r of rows) {
        ins.run({ ...r, directory: r.directory ?? "(unknown)" });
    }
}

// ---- 方案 C 派生：session 汇总表（从 agg_session_hour GROUP BY session+model）----
db.exec("DELETE FROM agg_session");
{
    const ins = db.prepare(`
        INSERT OR REPLACE INTO agg_session (
            source, env, session_id, model, directory, title,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens,
            started_at, ended_at
        ) VALUES (@source, @env, @session_id, @model, @directory, @title,
            @calls, @input_tokens, @output_tokens, @cache_read_tokens, @cache_write_tokens,
            @started_at, @ended_at)
    `);
    const rows = db
        .prepare(
            `
        SELECT source, env, session_id, model, directory,
            SUM(calls) AS calls,
            SUM(input_tokens) AS input_tokens, SUM(output_tokens) AS output_tokens,
            SUM(cache_read_tokens) AS cache_read_tokens, SUM(cache_write_tokens) AS cache_write_tokens,
            MIN(hour_start) AS started_at, MAX(hour_start) + 3600000 AS ended_at
        FROM agg_session_hour GROUP BY source, env, session_id, model, directory
    `,
        )
        .all() as {
        source: string;
        env: string;
        session_id: string;
        model: string;
        directory: string | null;
        calls: number;
        input_tokens: number;
        output_tokens: number;
        cache_read_tokens: number;
        cache_write_tokens: number;
        started_at: number;
        ended_at: number;
    }[];
    for (const r of rows) {
        ins.run({
            source: r.source,
            env: r.env,
            session_id: r.session_id,
            model: r.model,
            directory: r.directory,
            title: null, // 聚合层无法保留窗口内最新 title（需 records 或 session 表）
            calls: r.calls,
            input_tokens: r.input_tokens,
            output_tokens: r.output_tokens,
            cache_read_tokens: r.cache_read_tokens,
            cache_write_tokens: r.cache_write_tokens,
            started_at: r.started_at,
            ended_at: r.ended_at,
        });
    }
}

const count = (t: string) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
console.log("===== 行数对比 =====");
console.log(`records        : ${String(record_count)}`);
console.log(`A daily        : ${String(count("agg_daily"))}`);
console.log(`B hour         : ${String(count("agg_hour"))}`);
console.log(`C session_hour : ${String(count("agg_session_hour"))}`);
console.log(`C→session      : ${String(count("agg_session"))}`);

// ---- 语义重建：以 records 重算为 oracle，验证各方案能否覆盖 dashboard 区域 ----
console.log("\n===== dashboard 区域覆盖 =====");
const oracle_summary = db
    .prepare(
        `
    SELECT COUNT(*) AS calls,
        COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM token_stats_records WHERE timestamp >= @s AND timestamp < @e
`,
    )
    .get({ s: START, e: END }) as { calls: number; sessions: number; tokens: number };

// A: daily 按窗口内日期聚合
const a_summary = db
    .prepare(
        `
    SELECT SUM(calls) AS calls,
        COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM agg_daily WHERE date >= @ds AND date <= @de
`,
    )
    .get({ ds: day_str(START), de: day_str(END) }) as {
    calls: number | null;
    sessions: number | null;
    tokens: number | null;
};

// B: hour 表按窗口聚合（但 sessions 列是 COUNT DISTINCT 后无法再 SUM 精确去重）
const b_summary = db
    .prepare(
        `
    SELECT SUM(calls) AS calls,
        SUM(sessions) AS sessions_sum,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM agg_hour WHERE hour_start >= @s AND hour_start < @e
`,
    )
    .get({ s: hour_start(START), e: hour_start(END) }) as {
    calls: number | null;
    sessions_sum: number | null;
    tokens: number | null;
};

// C: session_hour → 窗口内 session 去重计数
const c_summary = db
    .prepare(
        `
    SELECT SUM(calls) AS calls,
        COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM agg_session_hour WHERE hour_start >= @s AND hour_start < @e
`,
    )
    .get({ s: hour_start(START), e: hour_start(END) }) as {
    calls: number | null;
    sessions: number | null;
    tokens: number | null;
};

console.log(
    `oracle  : calls=${String(oracle_summary.calls)} sessions=${String(oracle_summary.sessions)} tokens=${String(oracle_summary.tokens)}`,
);
console.log(
    `A daily : calls=${String(a_summary.calls ?? 0)} sessions=${String(a_summary.sessions ?? 0)} tokens=${String(a_summary.tokens ?? 0)}  ${a_summary.sessions === oracle_summary.sessions && a_summary.tokens === oracle_summary.tokens ? "✓" : "✗"}`,
);
console.log(
    `B hour  : calls=${String(b_summary.calls ?? 0)} sessions(SUM)=${String(b_summary.sessions_sum ?? 0)} tokens=${String(b_summary.tokens ?? 0)}  ${b_summary.calls === oracle_summary.calls && b_summary.tokens === oracle_summary.tokens ? "✓calls/tokens" : "✗"}`,
);
console.log(
    `C sessh : calls=${String(c_summary.calls ?? 0)} sessions=${String(c_summary.sessions ?? 0)} tokens=${String(c_summary.tokens ?? 0)}  ${c_summary.sessions === oracle_summary.sessions && c_summary.tokens === oracle_summary.tokens ? "✓" : "✗"}`,
);

// B 的 sessions 误计验证：hour 内 SUM(sessions) 跨小时重复计数同一 session
console.log(
    `\nB hour sessions SUM 与 oracle 差值: ${String((b_summary.sessions_sum ?? 0) - oracle_summary.sessions)}（跨小时 session 被重复计数 → 需要 session 维度才能精确）`,
);

// heatmap：C 能从 hour_start 派生 weekday/hour；B 的 sessions 跨小时重复
const b_heatmap = db
    .prepare(
        `
    SELECT CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday,
        CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour,
        SUM(calls) AS calls,
        SUM(sessions) AS sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM agg_hour
    WHERE hour_start >= @s AND hour_start < @e
    GROUP BY CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER),
             CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER)
`,
    )
    .all({ s: hour_start(START), e: hour_start(END) }) as {
    calls: number;
    sessions: number;
    tokens: number;
}[];
const c_heatmap = db
    .prepare(
        `
    SELECT CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS weekday,
        CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER) AS hour,
        SUM(calls) AS calls,
        COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM agg_session_hour
    WHERE hour_start >= @s AND hour_start < @e
    GROUP BY CAST(strftime('%w', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER),
             CAST(strftime('%H', hour_start/1000, 'unixepoch', '+8 hours') AS INTEGER)
`,
    )
    .all({ s: hour_start(START), e: hour_start(END) }) as {
    calls: number;
    sessions: number;
    tokens: number;
}[];
const oracle_heatmap = db
    .prepare(
        `
    SELECT COUNT(*) AS calls,
        COUNT(DISTINCT source || '|' || env || '|' || session_id) AS sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM token_stats_records WHERE timestamp >= @s AND timestamp < @e
`,
    )
    .get({ s: START, e: END }) as { calls: number; sessions: number; tokens: number };
const b_heat_sessions = b_heatmap.reduce((sum, c) => sum + c.sessions, 0);
const c_heat_sessions = c_heatmap.reduce((sum, c) => sum + c.sessions, 0);
console.log(
    `\nheatmap calls : B=${String(b_heatmap.reduce((s, c) => s + c.calls, 0))} C=${String(c_heatmap.reduce((s, c) => s + c.calls, 0))} oracle=${String(oracle_heatmap.calls)}`,
);
console.log(
    `heatmap tokens: B=${String(b_heatmap.reduce((s, c) => s + c.tokens, 0))} C=${String(c_heatmap.reduce((s, c) => s + c.tokens, 0))} oracle=${String(oracle_heatmap.tokens)}`,
);
console.log(
    `heatmap sess  : B(SUM)=${String(b_heat_sessions)} C(distinct)=${String(c_heat_sessions)} oracle=${String(oracle_heatmap.sessions)}`,
);

// time chart hour 粒度：B/C 都能按 (hour, model) 聚合
const b_chart = db
    .prepare(
        `
    SELECT SUM(calls) AS calls,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM agg_hour WHERE hour_start >= @s AND hour_start < @e
`,
    )
    .get({ s: hour_start(START), e: hour_start(END) }) as { calls: number; tokens: number };
const c_chart = db
    .prepare(
        `
    SELECT SUM(calls) AS calls,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM agg_session_hour WHERE hour_start >= @s AND hour_start < @e
`,
    )
    .get({ s: hour_start(START), e: hour_start(END) }) as { calls: number; tokens: number };
console.log(
    `time chart calls/tokens: B=${String(b_chart.calls)}/${String(b_chart.tokens)} C=${String(c_chart.calls)}/${String(c_chart.tokens)} oracle=${String(oracle_summary.calls)}/${String(oracle_summary.tokens)}`,
);

db.close();

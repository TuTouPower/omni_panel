/**
 * s008 spike 实验 2：聚合层 vs records 直查的读取规模（AC5 支撑）
 *
 * 固定聚合分组数（200 session × 5 model × 24h），把每条 session 的 message
 * 数从 ~25 提升到 ~250、~2500，比较：
 *   - records 直查（t191 query_dashboard 的 SQL）读取/返回行数
 *   - session-hour 聚合表读取行数
 */
import Database from "better-sqlite3";

function build(density: number): {
    records: number;
    agg_rows: number;
    oracle_scan: number;
    agg_scan: number;
} {
    const db = new Database(":memory:");
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
        CREATE TABLE agg_session_hour (
            source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
            hour_start INTEGER NOT NULL, model TEXT NOT NULL, directory TEXT,
            calls INTEGER NOT NULL, input_tokens INTEGER NOT NULL, output_tokens INTEGER NOT NULL,
            cache_read_tokens INTEGER NOT NULL, cache_write_tokens INTEGER NOT NULL,
            PRIMARY KEY (source, env, session_id, hour_start, model)
        );
    `);
    const START = 1_750_000_000_000;
    const MODELS = ["sonnet", "opus", "haiku", "kimi", "gpt"];
    const DIRS = ["/proj/a", "/proj/b", "/proj/c"];
    const AGENTS: [string, string][] = [
        ["claude-code", "claude_code"],
        ["opencode", "opencode"],
        ["kimi-code", "kimi_code"],
    ];
    const ENVS = ["win", "wsl"];
    const ins = db.prepare(`INSERT INTO token_stats_records (
        source, env, session_id, title, directory, message_id, role, timestamp,
        model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, agent
    ) VALUES (@source, @env, @session_id, @title, @directory, @message_id, @role,
        @timestamp, @model, @input_tokens, @output_tokens, @cache_read_tokens,
        @cache_write_tokens, @agent)`);
    const tx = db.transaction(() => {
        let mid = 0;
        for (let s = 0; s < 200; s += 1) {
            const session_id = `session-${String(s)}`;
            const [agent, source] = AGENTS[s % AGENTS.length]!;
            const env = ENVS[s % ENVS.length]!;
            const directory = DIRS[s % DIRS.length]!;
            for (let i = 0; i < density; i += 1) {
                const model = MODELS[i % MODELS.length]!;
                ins.run({
                    source,
                    env,
                    session_id,
                    title: `Session ${String(s)}`,
                    directory,
                    message_id: `m-${String(mid++)}`,
                    role: "assistant",
                    timestamp: START + ((s * 37 + i * 3) % (24 * 3600000)),
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
    const records = (
        db.prepare("SELECT COUNT(*) AS c FROM token_stats_records").get() as { c: number }
    ).c;

    // 回填聚合表
    db.exec(`
        INSERT INTO agg_session_hour (
            source, env, session_id, hour_start, model, directory,
            calls, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens
        )
        SELECT source, env, session_id,
            (timestamp - ((timestamp + 28800000) % 3600000)) AS hour_start,
            model, directory, COUNT(*) AS calls,
            SUM(input_tokens), SUM(output_tokens),
            SUM(cache_read_tokens), SUM(cache_write_tokens)
        FROM token_stats_records
        GROUP BY source, env, session_id, hour_start, model, directory
    `);
    const agg_rows = (
        db.prepare("SELECT COUNT(*) AS c FROM agg_session_hour").get() as { c: number }
    ).c;

    // records 直查：t191 rollup SQL 的中间结果行数（分组数）
    const oracle_scan = (
        db
            .prepare(
                `
        SELECT COUNT(*) AS c FROM (
            SELECT source, env, model, directory, session_id
            FROM token_stats_records
            GROUP BY source, env, model, directory, session_id
        )
    `,
            )
            .get() as { c: number }
    ).c;

    // 聚合表读取：窗口内按 hour+model 分组行数（dashboard time chart 最小集合）
    const agg_scan = (
        db
            .prepare(
                `
        SELECT COUNT(*) AS c FROM (
            SELECT hour_start, model FROM agg_session_hour
            GROUP BY hour_start, model
        )
    `,
            )
            .get() as { c: number }
    ).c;

    db.close();
    return { records, agg_rows, oracle_scan, agg_scan };
}

for (const density of [25, 250, 2500]) {
    const r = build(density);
    console.log(
        `density=${String(density)}  records=${String(r.records)}  agg_rows=${String(r.agg_rows)}  ` +
            `records_rollup_groups=${String(r.oracle_scan)}  agg_time_chart_read=${String(r.agg_scan)}`,
    );
}

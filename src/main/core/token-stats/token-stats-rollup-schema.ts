export const ROLLUP_INIT_SQL = `
CREATE TABLE IF NOT EXISTS token_stats_hour_rollup (
    source TEXT NOT NULL,
    env TEXT NOT NULL,
    session_id TEXT NOT NULL,
    hour_start INTEGER NOT NULL,
    model TEXT NOT NULL,
    directory TEXT,
    agent TEXT NOT NULL,
    calls INTEGER NOT NULL DEFAULT 0,
    input_tokens INTEGER NOT NULL DEFAULT 0,
    output_tokens INTEGER NOT NULL DEFAULT 0,
    cache_read_tokens INTEGER NOT NULL DEFAULT 0,
    cache_write_tokens INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (source, env, session_id, hour_start, model, directory, agent)
);

CREATE TABLE IF NOT EXISTS token_stats_data_version (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version INTEGER NOT NULL DEFAULT 0
);
INSERT INTO token_stats_data_version (id, version) VALUES (1, 0)
    ON CONFLICT(id) DO NOTHING;

CREATE TABLE IF NOT EXISTS token_stats_meta (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    hour_rollup_ready INTEGER NOT NULL DEFAULT 0
);
INSERT INTO token_stats_meta (id, hour_rollup_ready) VALUES (1, 0)
    ON CONFLICT(id) DO NOTHING;
`;

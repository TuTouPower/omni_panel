"""SPIKE s003: 方案 A 性能验证 —— 30d(~60 万行)records 上 GROUP BY weekday,hour 聚合耗时。"""
import sqlite3
import time
from datetime import datetime, timedelta, timezone

EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)
T0 = datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc)
ROWS = 600_000
DAYS = 30

con = sqlite3.connect(":memory:")
con.execute(
    """CREATE TABLE token_stats_records (
        source TEXT NOT NULL, env TEXT NOT NULL, session_id TEXT NOT NULL,
        message_id TEXT NOT NULL, role TEXT NOT NULL, timestamp INTEGER NOT NULL,
        model TEXT NOT NULL, input_tokens INTEGER, output_tokens INTEGER,
        cache_read_tokens INTEGER, cache_write_tokens INTEGER, agent TEXT NOT NULL
    )"""
)
con.execute(
    "CREATE INDEX idx_records_env_ts ON token_stats_records(env, timestamp DESC)"
)

batch = []
base = int((T0 - EPOCH).total_seconds() * 1000)
per_day = ROWS // DAYS
for i in range(ROWS):
    day = i // per_day
    ts = base + day * 86_400_000 + (i % per_day) * 1000  # 每秒一条,约覆盖 23h/天
    batch.append(
        ("cli", "dev", f"sid{i % 5000}", f"mid{i}", "user", ts, "model", 100, 50, 20, 10, "agent")
    )
con.executemany(
    "INSERT INTO token_stats_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?)", batch
)
con.commit()
print(f"插入 {ROWS} 行完成")

# 30d 窗口范围(近似 whole-table): start/end 覆盖全量
end_ts = base + DAYS * 86_400_000
Q = """
SELECT
    CAST(strftime('%w', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS w,
    CAST(strftime('%H', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS h,
    COUNT(*), COUNT(DISTINCT session_id),
    SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens)
FROM token_stats_records
WHERE env = 'dev' AND timestamp >= ? AND timestamp <= ?
GROUP BY w, h
"""
for label, params in [
    ("全表(30d)", (base, end_ts)),
    ("窄窗口(7d)", (base, base + 7 * 86_400_000)),
    ("窄窗口(1d)", (base, base + 86_400_000)),
]:
    t0 = time.perf_counter()
    rows = con.execute(Q, params).fetchall()
    dt = time.perf_counter() - t0
    print(f"{label}: {dt*1000:.1f} ms, {len(rows)} 格")

# 对照: 现有 records 路径 LIMIT 100000 的 SELECT(7d 场景)耗时
Q2 = "SELECT * FROM token_stats_records WHERE env='dev' AND timestamp>=? AND timestamp<=? ORDER BY timestamp DESC LIMIT 100000"
t0 = time.perf_counter()
rows = con.execute(Q2, (base, base + 7 * 86_400_000)).fetchall()
dt = time.perf_counter() - t0
print(f"对照 7d LIMIT 100000 SELECT: {dt*1000:.1f} ms, 返回 {len(rows)} 行")

con.close()

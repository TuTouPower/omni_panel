"""SPIKE s003: 验证 SQLite strftime 对 epoch ms 的 weekday/hour 聚合（UTC+8）。

对比目标：SQL 侧 strftime('%w'/'%H', ts/1000, 'unixepoch', '+8 hours') 的结果
须与 Python zoneinfo('Asia/Shanghai') 解释同一 epoch 的 weekday/hour 一致。
tokens/calls/sessions 三种聚合指标计数正确性一并验证。
"""
import sqlite3
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

TZ = ZoneInfo("Asia/Shanghai")
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def to_epoch_ms(iso_cn: str) -> int:
    """北京时间字符串 -> epoch ms（UTC 即真实 epoch）。"""
    dt = datetime.fromisoformat(iso_cn).replace(tzinfo=TZ)
    return int((dt - EPOCH).total_seconds() * 1000)


def expected(ts_ms: int):
    dt = datetime.fromtimestamp(ts_ms / 1000, TZ)
    w = (dt.weekday() + 1) % 7  # 0=周日
    return w, dt.hour


# 覆盖:跨日界、跨周边界、月界、普通时刻、23:59 边缘
CASES = [
    "2026-07-01 12:00:00",  # 周三
    "2026-07-01 00:00:00",  # 日界
    "2026-07-01 23:59:59",
    "2026-07-05 00:00:00",  # 周日
    "2026-07-05 23:59:59",  # 周日 23:59 -> 周一 00:00 边界
    "2026-07-06 00:00:00",  # 周一
    "2026-07-31 23:59:59",  # 月界
    "2026-08-01 00:00:00",
    "2026-01-01 00:00:00",  # 年界
]

con = sqlite3.connect(":memory:")
con.execute(
    """CREATE TABLE records (
        session_id TEXT, role TEXT, timestamp INTEGER NOT NULL,
        input_tokens INTEGER, output_tokens INTEGER,
        cache_read_tokens INTEGER, cache_write_tokens INTEGER
    )"""
)

# 每个 case 插两行(同 session)以验证 sessions 去重;tokens 给已知值
sid = 0
for iso in CASES:
    sid += 1
    ts = to_epoch_ms(iso)
    con.execute(
        "INSERT INTO records VALUES (?,?,?,?,?,?,?)",
        (f"sid{sid}", "user", ts, 100, 50, 20, 10),
    )
    con.execute(
        "INSERT INTO records VALUES (?,?,?,?,?,?,?)",
        (f"sid{sid}", "assistant", ts, 200, 60, 0, 30),
    )
con.commit()

# SQL 聚合: weekday(0=周日) x hour
rows = con.execute(
    """SELECT
        CAST(strftime('%w', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS w,
        CAST(strftime('%H', timestamp/1000, 'unixepoch', '+8 hours') AS INTEGER) AS h,
        COUNT(*) AS calls,
        COUNT(DISTINCT session_id) AS sessions,
        SUM(input_tokens + output_tokens + cache_read_tokens + cache_write_tokens) AS tokens
    FROM records
    GROUP BY w, h
    ORDER BY w, h"""
).fetchall()
sql_map = {(r[0], r[1]): r for r in rows}

fails = 0
for iso in CASES:
    ts = to_epoch_ms(iso)
    ew, eh = expected(ts)
    got = sql_map.get((ew, eh))
    if got is None:
        print(f"FAIL {iso}: 无聚合行 w={ew} h={eh}")
        fails += 1
        continue
    # 每 case 两行,每行 tokens 各 180/290? 实际:180+290=470
    exp_calls = 2
    exp_sessions = 1
    exp_tokens = 180 + 290  # 100+50+20+10=180; 200+60+0+30=290
    if got[2] != exp_calls or got[3] != exp_sessions or got[4] != exp_tokens:
        print(f"FAIL {iso}: SQL聚合 {got[2:]}, 期望 calls={exp_calls} sessions={exp_sessions} tokens={exp_tokens}")
        fails += 1
    else:
        print(f"OK   {iso}: w={ew} h={eh} calls={got[2]} sessions={got[3]} tokens={got[4]}")

# 聚合行数上限: 168
print(f"聚合行数: {len(rows)} (上限 168)")

# 全部用例的 SQL weekday/hour 与预期一致检查
all_ok = all(expected(to_epoch_ms(iso)) in sql_map for iso in CASES)
print(f"全部 weekday/hour 映射一致: {all_ok}")
print("FAILS:", fails)
con.close()

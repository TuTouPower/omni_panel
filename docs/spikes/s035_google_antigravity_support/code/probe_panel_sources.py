#!/usr/bin/env python3
"""s035: antigravity 会话/代理面板数据源勘测（只读，只输出结构统计）。

覆盖：brains/messages 单消息格式、history.jsonl 类型分布、
conversation_summaries.db 索引表、conversations/*.db 表与 protobuf 文本可达性。
不输出 secret 与完整用户内容。
"""

import glob
import json
import os
import sqlite3
from collections import Counter

ROOT = os.path.expanduser("~/.gemini/antigravity-cli")


def main() -> None:
    brains = sorted(glob.glob(os.path.join(ROOT, "brain", "*")))
    print(f"brains: {len(brains)}")

    msg_files = [
        f
        for f in glob.glob(os.path.join(ROOT, "brain", "*", ".system_generated", "messages", "*.json"))
        if not f.endswith("read.json")
    ]
    print(f"single message files: {len(msg_files)}")
    kinds = Counter()
    ts_ok = 0
    for path in msg_files:
        try:
            with open(path, encoding="utf-8") as handle:
                record = json.load(handle)
        except (OSError, ValueError):
            kinds["unreadable"] += 1
            continue
        sender = str(record.get("sender", "?"))
        if sender == "system":
            kinds["system"] += 1
        elif "/task-" in sender:
            kinds["task_tool_output"] += 1
        else:
            kinds["other"] += 1
        if record.get("timestamp") and record.get("content") is not None:
            ts_ok += 1
    print(f"message kinds: {dict(kinds)} ts+content: {ts_ok}")

    history_path = os.path.join(ROOT, "history.jsonl")
    type_counts: Counter[str | None] = Counter()
    workspaces: set[str] = set()
    try:
        with open(history_path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                row = json.loads(line)
                type_counts[row.get("type")] += 1
                if not row.get("type") and row.get("workspace"):
                    workspaces.add(str(row["workspace"]))
    except OSError as exc:
        print(f"history.jsonl unreadable: {exc}")
    print(f"history types: {dict(type_counts)} user workspaces: {len(workspaces)}")

    summaries_path = os.path.join(ROOT, "conversation_summaries.db")
    conn = sqlite3.connect(f"file:{summaries_path}?mode=ro", uri=True)
    tables = [r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='table'")]
    print(f"summaries tables: {tables}")
    cols = [r[1] for r in conn.execute("PRAGMA table_info(conversation_summaries)")]
    total = conn.execute("SELECT COUNT(*) FROM conversation_summaries").fetchone()[0]
    conn.close()
    print(f"summaries rows: {total} cols: {cols}")

    dbs = sorted(glob.glob(os.path.join(ROOT, "conversations", "*.db")))
    print(f"conversation dbs: {len(dbs)}")
    conn = sqlite3.connect(f"file:{dbs[-1]}?mode=ro", uri=True)
    for table in ("trajectory_meta", "steps", "gen_metadata", "executor_metadata"):
        try:
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            columns = [r[1] for r in conn.execute(f"PRAGMA table_info({table})")]
            print(f"  {table}: {count} rows cols={columns}")
        except sqlite3.Error as exc:
            print(f"  {table}: ERR {exc}")
    step_types = Counter(r[0] for r in conn.execute("SELECT step_type FROM steps"))
    conn.close()
    print(f"  sample step_types: {dict(sorted(step_types.items()))}")


if __name__ == "__main__":
    main()

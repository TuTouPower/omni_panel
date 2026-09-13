#!/usr/bin/env python3
"""只读探针：核实 ~/.commandcode 会话 JSONL 能否支撑 token 统计与会话历史。

不打印用户正文，只输出结构、计数与时间范围。
"""
from __future__ import annotations

import collections
import glob
import json
import os
import statistics

BASE = os.path.expanduser("~/.commandcode/projects")


def session_files() -> list[str]:
    return [
        f
        for f in glob.glob(os.path.join(BASE, "*", "*.jsonl"))
        if not f.endswith(".checkpoints.jsonl")
    ]


def main() -> None:
    files = session_files()
    usage_lines = 0
    files_with_usage = 0
    first_inputs: list[int] = []
    last_inputs: list[int] = []
    turns_per_session: list[int] = []
    project_count: collections.Counter[str] = collections.Counter()
    decreases = 0
    timestamps: list[str] = []
    record_keys: collections.Counter[str] = collections.Counter()
    content_types: collections.Counter[str] = collections.Counter()
    usage_fields: collections.Counter[str] = collections.Counter()
    session_id_matches_filename = 0
    models: set[str] = set()

    for path in files:
        records = [json.loads(line) for line in open(path) if line.strip()]
        sid = [r["id"] for r in records if r.get("type") == "session"]
        if sid and sid[0] == os.path.basename(path)[:-6]:
            session_id_matches_filename += 1
        project_count[os.path.basename(os.path.dirname(path))] += 1

        usages = []
        for r in records:
            record_keys.update(r.keys())
            if r.get("timestamp"):
                timestamps.append(r["timestamp"])
            message = r.get("message") or {}
            for block in message.get("content") or []:
                if isinstance(block, dict):
                    content_types[block.get("type")] += 1
            usage = r.get("usage")
            if usage:
                usages.append(usage)
                usage_fields.update(usage.keys())
            if r.get("model"):
                models.add(r["model"])
        if not usages:
            continue
        files_with_usage += 1
        usage_lines += len(usages)
        turns_per_session.append(len(usages))
        first_inputs.append(usages[0]["inputTokens"])
        last_inputs.append(usages[-1]["inputTokens"])
        prev = None
        for u in usages:
            if prev is not None and u["inputTokens"] < prev:
                decreases += 1
            prev = u["inputTokens"]

    timestamps.sort()
    print("session jsonl files:", len(files))
    print("files with usage:", files_with_usage)
    print("usage lines:", usage_lines)
    print("filename == session id:", session_id_matches_filename, "/", len(files))
    print("record keys:", dict(record_keys))
    print("content block types:", dict(content_types))
    print("usage fields:", dict(usage_fields))
    print("models:", sorted(models))
    print("time range:", timestamps[0], "->", timestamps[-1])
    print("turns per session: median", statistics.median(turns_per_session))
    print("first-turn inputTokens: median", statistics.median(first_inputs))
    print("last-turn inputTokens: median", statistics.median(last_inputs))
    print("inputTokens decreases (all files):", decreases)
    print("by project:", project_count.most_common())
    print("per-record semantics: inputTokens 为累计 prompt（含 cacheRead）")


if __name__ == "__main__":
    main()

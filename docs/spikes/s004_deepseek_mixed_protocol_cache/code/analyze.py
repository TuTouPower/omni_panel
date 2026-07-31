#!/usr/bin/env python3
"""分析 claude projects 下 deepseek 模型行的 cache 三字段分布与按行判决。

目的：
1. 验证「按 cache_creation_input_tokens 区分 deepseek 的 OpenAI/Anthropic 接入」是否可行。
2. 验证现有归一化守卫 input >= cache_read 在真实混合协议数据上的判决正确率。

用法：analyze.py <projects_dir> [yyyy-mm-dd] [anth_end HH:MM] [openai_start HH:MM]
  projects_dir      ~/.claude/projects 路径（Win 或 WSL）
  yyyy-mm-dd        只统计该自然日（UTC+8）的行；缺省统计全部
  后两个参数        协议切换分界（UTC+8），用于分窗口判定误判；缺省不分窗
"""
import json
import glob
import os
import sys
from collections import defaultdict
from datetime import datetime, timezone, timedelta

CN = timezone(timedelta(hours=8))
PROJECTS = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser("~/.claude/projects")
DAY = sys.argv[2] if len(sys.argv) > 2 else None
ANTH_END = sys.argv[3] if len(sys.argv) > 3 else None
OPENAI_START = sys.argv[4] if len(sys.argv) > 4 else None


def judge(inp, cr):
    """现行守卫：cache_read>0 且 inp>=cache_read 才减。"""
    return "SUB" if (cr > 0 and inp >= cr) else "KEEP"


def scan():
    rows = []
    for f in glob.glob(f"{PROJECTS}/**/*.jsonl", recursive=True):
        try:
            fh = open(f, encoding="utf-8")
        except OSError:
            continue
        for line in fh:
            if "deepseek" not in line:
                continue
            try:
                rec = json.loads(line)
            except json.JSONDecodeError:
                continue
            if rec.get("type") != "assistant":
                continue
            msg = rec.get("message") or {}
            usage = msg.get("usage") or {}
            model = msg.get("model") or ""
            if not usage or "deepseek" not in model.lower():
                continue
            ts = rec.get("timestamp")
            try:
                t = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except (AttributeError, ValueError):
                continue
            if DAY and t.astimezone(CN).strftime("%Y-%m-%d") != DAY:
                continue
            rows.append(
                (
                    t,
                    model,
                    usage.get("input_tokens") or 0,
                    usage.get("cache_read_input_tokens") or 0,
                    usage.get("cache_creation_input_tokens") or 0,
                )
            )
        fh.close()
    rows.sort()
    return rows


def main():
    rows = scan()
    stats = defaultdict(lambda: defaultdict(int))
    for _t, m, inp, cr, cc in rows:
        s = stats[m]
        s["n"] += 1
        s["cc>0" if cc > 0 else "cc==0"] += 1
        if cr > 0:
            s["input>=cache_read" if inp >= cr else "input<cache_read"] += 1
    for m in sorted(stats):
        print(m, dict(stats[m]))

    if ANTH_END is None or OPENAI_START is None or not DAY:
        return

    y, mo, d = map(int, DAY.split("-"))
    ah, am = map(int, ANTH_END.split(":"))
    oh, om = map(int, OPENAI_START.split(":"))
    anth_end = datetime(y, mo, d, ah, am, tzinfo=CN)
    openai_start = datetime(y, mo, d, oh, om, tzinfo=CN)
    print(f"\n=== windowed misjudgment (model rows, only cr>0 matter) ===")
    for m in sorted(stats):
        for wname, lo, hi, correct in (
            ("ANTH", None, anth_end, "KEEP"),
            ("GAP", anth_end, openai_start, None),
            ("OPENAI", openai_start, None, "SUB"),
        ):
            cls = [
                r for r in rows
                if r[1] == m and r[3] > 0
                and (lo is None or r[0] >= lo) and (hi is None or r[0] < hi)
            ]
            if not cls:
                continue
            sub = [r for r in cls if judge(r[2], r[3]) == "SUB"]
            keep = [r for r in cls if judge(r[2], r[3]) == "KEEP"]
            line = f"  {m} [{wname}] cr>0={len(cls)} SUB={len(sub)} KEEP={len(keep)}"
            if correct == "KEEP":
                line += f"  MISJUDGED={len(sub)}"
            elif correct == "SUB":
                line += f"  MISJUDGED={len(keep)}"
            print(line)


if __name__ == "__main__":
    main()

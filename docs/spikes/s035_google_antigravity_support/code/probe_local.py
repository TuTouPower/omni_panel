#!/usr/bin/env python3
"""s035 本机 Antigravity 相关路径只读探针（不输出 secret 内容）。

输出仅含：路径存在性、文件大小、history.jsonl 键名、sqlite 表名。
OAuth token 文件只做 file(1) 类型 + 字节数判定，不读内容。
"""

import json
import sqlite3
import subprocess
from pathlib import Path

HOME = Path.home()


def check_path(path: Path) -> str:
    if not path.exists():
        return "missing"
    if path.is_dir():
        try:
            children = list(path.iterdir())
        except OSError as exc:
            return f"dir(unreadable: {exc})"
        return f"dir({len(children)} entries)"
    try:
        return f"file({path.stat().st_size} bytes)"
    except OSError as exc:
        return f"file(unreadable: {exc})"


def main() -> None:
    candidates = [
        HOME / ".antigravity",
        HOME / ".antigravity" / "session.json",
        HOME / ".config" / "Antigravity",
        HOME / ".cache" / "antigravity" / "staging",
        HOME / ".gemini" / "antigravity-cli",
        HOME / ".gemini" / "antigravity-cli" / "history.jsonl",
        HOME / ".gemini" / "antigravity-cli" / "conversations",
        HOME / ".gemini" / "antigravity-cli" / "antigravity-oauth-token",
    ]
    for path in candidates:
        print(f"{str(path)}: {check_path(path)}")

    history = HOME / ".gemini" / "antigravity-cli" / "history.jsonl"
    if history.is_file():
        try:
            with history.open(encoding="utf-8") as handle:
                for line in handle:
                    line = line.strip()
                    if not line:
                        continue
                    record = json.loads(line)
                    print(f"history.jsonl keys: {sorted(record.keys())}")
                    break
        except (OSError, ValueError) as exc:
            print(f"history.jsonl unreadable: {exc}")

    conv_dir = HOME / ".gemini" / "antigravity-cli" / "conversations"
    dbs = sorted(conv_dir.glob("*.db")) if conv_dir.is_dir() else []
    print(f"conversation dbs: {len(dbs)}")
    if dbs:
        try:
            with sqlite3.connect(f"file:{dbs[0]}?mode=ro", uri=True) as conn:
                tables = [row[0] for row in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
                )]
            print(f"sample db tables: {tables}")
        except sqlite3.Error as exc:
            print(f"sample db unreadable: {exc}")

    token = HOME / ".gemini" / "antigravity-cli" / "antigravity-oauth-token"
    if token.is_file():
        try:
            out = subprocess.run(
                ["file", str(token)], capture_output=True, text=True, timeout=10,
            )
            print(out.stdout.strip() or "file: no output")
        except (OSError, subprocess.SubprocessError) as exc:
            print(f"file(1) failed: {exc}")


if __name__ == "__main__":
    main()

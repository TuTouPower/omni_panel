#!/usr/bin/env python3
"""scripts/task.py 的格式契约测试。

仓库 Prettier 规则要求 JSON 4 空格缩进 + LF 换行；task.py 的 save() 必须遵守，
否则 docs/tasks_index.json 被 git diff --check / Prettier 拒绝（t102_code_f002）。

运行：python -m pytest scripts/test_task.py
"""

import json
import sys
from pathlib import Path

# 让 `import task` 能解析到同目录下的 scripts/task.py
sys.path.insert(0, str(Path(__file__).resolve().parent))

import task  # noqa: E402


def test_save_uses_lf_line_endings(tmp_path):
    """save() 不得写出 CRLF（Windows 文本模式默认会，必须显式 newline='\\n'）。"""
    out = tmp_path / "tasks_index.json"
    task.save(out, {"tasks": []})
    raw = out.read_bytes()
    assert b"\r\n" not in raw, "save() wrote CRLF; expected LF"


def test_save_uses_4_space_indent(tmp_path):
    """save() 必须用 4 空格缩进，匹配仓库 Prettier 配置。"""
    out = tmp_path / "tasks_index.json"
    task.save(
        out,
        {"tasks": [{"tid": "t001", "title": "x", "slug": "x", "status": "backlog", "branch": "", "note": ""}]},
    )
    text = out.read_text(encoding="utf-8")
    # 嵌套 list 内 dict 键缩进 12 空格（4 "tasks" + 4 列表元素 + 4 键），
    # 证明 indent=4（indent=2 下同名键在 6 空格）
    assert "\n    \"tasks\"" in text, "top-level list key must be indented 4 spaces"
    assert "\n            \"tid\"" in text, "nested list-dict keys must be indented 12 spaces (4+4+4)"


def test_save_round_trips_utf8_and_data(tmp_path):
    """save() 写出的文件能被 json 正确读回，中文不丢。"""
    out = tmp_path / "tasks_index.json"
    payload = {"tasks": [{"tid": "t001", "title": "即将重置", "slug": "x", "status": "backlog", "branch": "", "note": ""}]}
    task.save(out, payload)
    data = json.loads(out.read_text(encoding="utf-8"))
    assert data["tasks"][0]["title"] == "即将重置"

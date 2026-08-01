"""pending.py / render_review_prompts.py 原子写。

两脚本写权威/派生文件改用 task.py 的 _atomic_write_text，中断不留半写目标、清理 tmp。
"""
import argparse
import sys
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parents[2] / "scripts"
sys.path.insert(0, str(SCRIPTS_DIR))

import pytest


def _raise_runtime_error(*_args, **_kwargs):
    raise RuntimeError("injected failure")


def _pending_fixture() -> str:
    return (
        "# 待办\n\n"
        "## 待办\n\n"
        "### p001 示例（2026-08-02）\n\n"
        "- 来源：测试\n"
        "- 内容：x\n"
        "- 处理：未开\n\n"
        "## 不办\n"
    )


def _archive_fixture() -> str:
    return "# 已闭环\n\n## 已处理待办\n"


def test_pending_archive_uses_atomic_write(tmp_path, monkeypatch):
    """pending.py cmd_archive 写 pending/archive 走 _atomic_write_text。"""
    import pending

    pending_path = tmp_path / "pending.md"
    archive_path = tmp_path / "archive.md"
    pending_path.write_text(_pending_fixture(), encoding="utf-8")
    archive_path.write_text(_archive_fixture(), encoding="utf-8")
    monkeypatch.setattr(pending, "PENDING_PATH", pending_path)
    monkeypatch.setattr(pending, "ARCHIVE_PATH", archive_path)

    args = argparse.Namespace(ids=["p001"], fix_ref="t999", write=True)
    # os.replace 失败时目标保持原内容、tmp 清理。
    monkeypatch.setattr("task.os.replace", _raise_runtime_error)
    with pytest.raises(RuntimeError):
        pending.cmd_archive(args)
    assert "- 处理：未开" in pending_path.read_text(encoding="utf-8")
    assert not (tmp_path / "pending.md.tmp").exists()
    assert not (tmp_path / "archive.md.tmp").exists()


def test_render_review_prompts_write_uses_atomic_write(tmp_path, monkeypatch):
    """render_review_prompts._write_prompts 走 _atomic_write_text。"""
    import render_review_prompts

    out_dir = tmp_path / "prompts"
    out_dir.mkdir()
    target = out_dir / "code_review_prompt.md"
    target.write_text("旧 prompt", encoding="utf-8")

    monkeypatch.setattr("task.os.replace", _raise_runtime_error)
    with pytest.raises(RuntimeError):
        render_review_prompts._write_prompts(out_dir, {"code_review_prompt.md": "新 prompt"})
    assert target.read_text(encoding="utf-8") == "旧 prompt"
    assert not (out_dir / "code_review_prompt.md.tmp").exists()

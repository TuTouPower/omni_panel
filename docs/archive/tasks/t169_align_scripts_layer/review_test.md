# Task review t169（reviewer_focus: 测试）

- task：`t169_align_scripts_layer`
- spec：`docs/tasks/t169_align_scripts_layer/spec.md`
- diff_anchor：`71b61b22325740fb36a70caa96bf78f96107845c`
- target：`git diff 71b61b22325740fb36a70caa96bf78f96107845c`
- round：1
- reviewed_at：2026-07-31 11:49 UTC+8

## Findings

零 finding。

## 结论

- 改测方向复核：本轮无「迁就实现」的改测。删除的 `tests/unit/scripts/task_py.test.ts`（4 vitest 用例）与 `scripts/test_task.py`（3 pytest 用例）针对旧 JSON 数据模型的契约（`task.save()` 原子写 / LF / 4 空格缩进 / UTF-8 / finish 事务恢复），在新的 markdown-front-matter 数据模型下：
    - LF + UTF-8：`tests/repo_template/test_task_archive_dir.py:137 test_rebuild_index_uses_utf8_and_lf` 覆盖派生 `tasks_index.json` 的 LF 与中文不转义；`tests/repo_template/test_task_save.py:104 test_write_uses_lf_newlines` 覆盖 `task.md` 写 LF。rebuild 实现 `scripts/task.py:836` 用 `indent=4, newline="\n"` 对应旧 4 空格缩进契约。
    - finish 事务恢复：`tests/repo_template/test_task_archive_dir.py:184 test_close_task_rolls_back_when_move_fails` 覆盖归档移动失败时 front matter 回滚（防「已写 done、目录未归档」死锁）；旧「active+archive 同 tid 中断恢复」场景在新模型下由 `scan_tasks` 重复 tid 检测兜底（`test_scan_detects_dup_tid` 行 106）。删测试有等价/更高层覆盖，非契约丢失。
    - 旧 JSON 原子写（无 .tmp 残留）：新模型不再用 `.tmp` 临时文件写 `tasks_index.json`（`scripts/task.py:828-838` 直接 `write_text` 到最终路径），旧契约本身已被实现移除，删测试合法。
- 本轮新发现：0 条
- 未进表的提示：
    - 数据迁移产物（168 归档 + 1 活跃 task.md）正确性由上下文区已批准的测试策略（「`task.py list`/`show` 实际跑通验证」）间接覆盖，非专门断言逐文件 schema。实测 `python scripts/task.py list` 列出 t001–t169 全部 169 条无 TaskDataError，`show t169` 读出完整 front matter；抽查 `t001`/`t168` front matter 含完整 12 字段。属批准策略，不出 finding。
    - 迁移脚本 `.scratch/migrate_task_md.py` 本身未被 pytest 直接覆盖（一次性脚本，未在 diff 内，git-untracked）；其正确性由生成的 169 个 task.md 被 `scan_tasks` 接受间接验证。如未来需要回归保护迁移逻辑，可补一个对真实 `docs/archive/tasks/` 全目录跑 `scan_tasks` 的套件级断言（minor 建议，不阻断）。
- 总体判断：移植的 pytest 套件（197 用例，实测全过）真实驱动 CLI（`_task_cli` 子进程）与 import 级命令函数，断言落在用户可观察的文件系统 / git 状态 / front matter 字段上；start/finish/list/show/rebuild/preflight/edit/next-batch/drop/rewind/block/cleanup/add 关键路径均有覆盖；删除的旧测试契约在新模型下有等价/更高层覆盖；无危险模式命中；AC 全部满足（pytest 197 过、pnpm test 1910 过、list/show 跑通、归档 task.md schema 完整）。
- 系统性 follow-up：无

verdict: PASS

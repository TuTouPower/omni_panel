# Task review t179（reviewer_focus: 代码）

- task：`t179_task_py_atomic_write_restore`
- spec：`docs/tasks/t179_task_py_atomic_write_restore/spec.md`
- diff_anchor：`31745d5b8e602c231f529a6bb10aa13b98f164a9`
- target：`git diff 31745d5b8e602c231f529a6bb10aa13b98f164a9`
- round：1
- reviewed_at：2026-08-01 12:50 UTC+8

## Findings

### t179_code_f001 - tmp 残留清理只覆盖 os.replace 失败分支，写盘阶段失败时 tmp 残留

- 严重度：minor
- 锚点：spec 上下文区「风险与回退」点名"原子写引入 tmp 文件清理逻辑漏洞"；AC3 要求测试覆盖「tmp 残留清理」。AC1 目标文件数据完整性未被违反（目标永不半写），故不 blocking。
- 位置：`scripts/task.py:386-400`（`_atomic_write_text`）
- 问题：`try/except BaseException` 只包住 `os.replace`（394-400 行）；当 `f.write` / `f.flush` / `os.fsync`（389-392 行）抛错——即 AC1 括号中明确列举的「写盘失败」场景——tmp 文件已创建并残留部分/垃圾内容，无任何清理。对应地，`test_atomic_write_fsync_failure_keeps_target`（tests/repo_template/test_task_save.py:127-134）只断言目标文件完好，未断言 tmp 被清理，因为该路径实现本就不清理。失败场景：fsync 抛错 → 任务目录残留 `task.md.tmp`（或 `docs/tasks_index.json.tmp` / `docs/archive/tasks_index.json.tmp`）。`*.tmp` 已在 .gitignore，且下次写同一确定性 tmp 路径会截断覆盖，故为自愈性残留，无数据损坏。
- 建议：把 tmp 打开写入整体纳入 try/except，任何阶段失败都 `tmp_path.unlink()`（吞 OSError）后重抛；或在 `with` 块结束后对写入异常统一清理。随后可在 fsync 失败测试中补断言 tmp 不存在。

## 结论

- 本轮新发现：1 条（全部 minor）
- 未进表的提示：
    - 文件过大：`scripts/task.py` = 2233 行（≥ 800 important 阈值），本 task 净增 17 行（numstat +20/-3），命中「已达阈值且本 task 净增」规则，按降级规则仅列出不进 finding 表，需后续拆分（非本 task 引入）。
    - 复杂度：`_atomic_write_text` 近似 McCabe ≈ 3（基数 1 + except BaseException + except OSError），无提示。
    - 范围外观察：未对替换后的父目录做 fsync（spec 只要求 tmp+文件 fsync+os.replace，符合契约）；`except BaseException` 仅清理后重抛，不吞异常，合理；spec 措辞 `rebuild_indexes` 对应代码单函数 `rebuild_index`，该函数一次写入 ACTIVE_PATH 与 ARCHIVE_PATH 两个派生索引，功能覆盖一致。
- AC 覆盖核对：AC1（write_front_matter 经 tmp+fsync+os.replace，目标不半写）✓；AC2（rebuild_index 写两个派生索引 JSON 走同原子写）✓；AC3（补失败路径测试：replace 失败+tmp 清理、fsync 写盘失败；repo_template 197 基线 + 2 新用例 = 199 绿，实测 `pytest tests/repo_template/` 199 passed）✓。改动范围仅 task.md / scripts/task.py / tests/repo_template/test_task_save.py，无范围外行为，未触碰 out-of-scope 的 pending.py / render_review_prompts.py。
- 总体判断：实现正确，AC 全覆盖，无未解决 critical / important，仅 1 条 minor 残留清理缺口。
- 系统性 follow-up：无

verdict: PASS

## Round 2 (2026-08-01 12:58 UTC+8)

## Findings

本轮新发现：无。

## 结论

- 前轮 finding 复核：
    - **t179_code_f001（minor）→ 已消除**。以当前 `git diff 31745d5b8e602c231f529a6bb10aa13b98f164a9` 为准：`_atomic_write_text`（scripts/task.py:386-400）的 try 块已扩至覆盖完整 tmp 生命周期——open/write/flush/fsync（390-393）与 os.replace（394）——任一阶段抛错都落入 `except BaseException`，先 `tmp_path.unlink()`（吞 OSError）后重抛。`with` 块退出先关闭文件再进 except，Windows 上 unlink 不受打开句柄影响；`tmp_path.open` 自身失败时 unlink 抛 FileNotFoundError（OSError 子类）被吞，原异常正确重抛（内层 except OSError 不改变外层 `raise` 语义）。写盘阶段（fsync）失败不再残留 tmp，原 finding 缺口消除。
    - 同根因的 test reviewer finding **t179_test_f001（important）同步消除**：fsync 失败用例已更名 `test_atomic_write_fsync_failure_keeps_target_and_cleans_tmp` 并补 `assert not (tmp_path / "task.md.tmp").exists()`（tests/repo_template/test_task_save.py:135）；replace 失败用例 `test_atomic_write_replace_failure_keeps_target_and_cleans_tmp` 断言目标保持原样 + tmp 被清理（116-124）。修复侧与测试侧由同一代码变更闭合。
- 本轮新发现：0 条。修复仅把 try 上移包住写盘阶段，未引入新分支、新状态或新依赖。
- 未进表的提示：
    - 文件过大：`scripts/task.py` = 2233 行（≥ 800 important 阈值），本 task 累计净增 17 行（numstat +20/-3，与 Round 1 相同，修复阶段无新增增长）；按降级规则只列不表，需后续拆分（非本 task 引入）。
    - 复杂度：`_atomic_write_text` McCabe ≈ 3（基数 1 + except BaseException + except OSError），无提示。
    - 前轮已提示、本轮仍存在但无实害：`path.with_suffix(path.suffix + ".tmp")`（scripts/task.py:388）对无后缀路径会抛 ValueError；当前两个调用方（task.md、tasks_index.json）均有后缀，无触发点。与 test reviewer 结论一致，仅提示不表。
- 测试实证：`pytest tests/repo_template/` 全量 199 passed（含 2 条新用例）；`test_write_uses_lf_newlines` 等既有用例已走真实 os.fsync 路径，确认 text 模式 fsync 在本平台可用。
- 总体判断：前轮唯一代码 finding 已按 diff 核实消除，修复未引入新问题，AC1/AC2/AC3 覆盖保持完整；无未解决 critical / important。
- 系统性 follow-up：无

verdict: PASS

# Task review t179（reviewer_focus: 测试）

- task：`t179_task_py_atomic_write_restore`
- spec：`docs/tasks/t179_task_py_atomic_write_restore/spec.md`
- diff_anchor：`31745d5b8e602c231f529a6bb10aa13b98f164a9`
- target：`git diff 31745d5b8e602c231f529a6bb10aa13b98f164a9`
- round：1
- reviewed_at：2026-08-01 12:50 UTC+8

## Findings

### t179_test_f001 - 写盘阶段（fsync/flush/write）失败路径泄漏 tmp 文件，AC3「tmp 残留清理」覆盖不完整

- 严重度：important
- 锚点：AC3「覆盖 tmp 残留清理与 os.replace 失败路径」；AC1「中断（如写盘失败）不产生半写状态」；spec 风险节「原子写引入 tmp 文件清理逻辑漏洞」
- 位置：`scripts/task.py:386-400`（`_atomic_write_text`）；测试 `tests/repo_template/test_task_save.py:127`（`test_atomic_write_fsync_failure_keeps_target`）
- 问题：
    1. `_atomic_write_text` 的 tmp 清理逻辑只包住 `os.replace` 分支（`scripts/task.py:393-399`）。`f.write` / `f.flush` / `os.fsync` 在 `with` 块内抛错时（`scripts/task.py:388-392`）异常直接传出，无任何 tmp 清理，`.tmp` 文件遗留在目标目录。这正是 spec 风险节明确点名的「tmp 文件清理逻辑漏洞」。
    2. 实测复现（`.scratch/check_tmp_leak.py`，monkeypatch `os.fsync` 抛 RuntimeError 后调 `write_front_matter`）：目标文件保持原样（无半写），但 `task.md.tmp` 残留存在。属可观测行为缺陷，资源泄漏为 prompt「blocking 硬阈值」明确可判类别。
    3. `test_atomic_write_fsync_failure_keeps_target` 只断言目标内容不变，未断言 tmp 清理；泄漏存在时测试仍通过。AC3 要求覆盖「tmp 残留清理」，但现仅 replace 失败路径断言了清理，写盘阶段失败路径未覆盖，泄漏被测试掩盖。
- 建议：
    - 实现侧：把失败清理扩展为覆盖整个 tmp 生命周期——`with` 块内写/fsync 失败与 `os.replace` 失败统一走 unlink 后重抛（unlink 前容错 tmp 未创建情形）。
    - 测试侧：`test_atomic_write_fsync_failure_keeps_target` 增加 `assert not (tmp_path / "task.md.tmp").exists()`；可另补 flush/write 失败路径用例。

## 结论

- 前轮 finding 复核：Round 1，无。
- 改测方向复核：无（diff 对 `tests/repo_template/test_task_save.py` 仅新增 2 用例，未修改既有测试，无「迁就实现」改测）。
- 本轮新发现：1 条。
- 未进表提示：
    - AC2（`rebuild_index` 派生索引原子写）无直接测试：现通过共享 helper `_atomic_write_text` 经 `write_front_matter` 触达，两调用点走同一生产逻辑，覆盖可接受；可选补一条 `rebuild_index` 失败路径用例（minor，不阻断）。
    - `path.with_suffix(path.suffix + ".tmp")` 对无后缀路径会抛 ValueError，当前调用方（`task.md` / `tasks_index.json`）均有后缀，无实害；属 code reviewer 范围，仅提示。
- 总体判断：新增 2 用例断言真实用户可观察行为（目标文件内容、tmp 存在性），monkeypatch 仅限文件系统边界（fsync/replace），符合 spec 测试策略；既有 197 基线 + 新增 2 用例全绿（实测 repo_template 199 passed）。但写盘阶段失败路径 tmp 泄漏已实测复现且测试未覆盖，存在 1 个未解决 important。
- 系统性 follow-up：无（泄漏属本 task spec 风险节点名范围，应由本 task 处置，无需另立 task）。

verdict: FAIL

## Round 2 (2026-08-01 13:01 UTC+8)

### 前轮 finding 复核

**t179_test_f001（写盘阶段失败泄漏 tmp，测试未覆盖 tmp 清理）——已消除。**

以 diff 与实测核实，不采信 implementer 自述：

1. 实现侧修复（`scripts/task.py:386-400`）：try 块现已包裹 tmp 全生命周期——`with tmp_path.open(...)` 内的 `f.write` / `f.flush` / `os.fsync`（389-393）与 `os.replace`（394）都在 try 内；任何 `BaseException` 统一走 `tmp_path.unlink()`（容错 `OSError`，覆盖 tmp 未创建时 unlink 抛 `FileNotFoundError` 的情形）后重抛（395-400）。此前 fsync/flush/write 失败时异常直接传出、tmp 残留的路径已被封死。
2. 测试侧修复（`tests/repo_template/test_task_save.py:127-135`）：用例更名为 `test_atomic_write_fsync_failure_keeps_target_and_cleans_tmp`，保留原「目标内容不变」断言（134 行），并新增 `assert not (tmp_path / "task.md.tmp").exists()`（135 行）。fsync 失败走与旧代码相同的泄漏路径，该断言针对旧实现必失败、对新实现必通过，是真实回归测试，非换形式弱化。
3. 实测：`python -m pytest tests/repo_template/test_task_save.py -q` → 17 passed；`python -m pytest tests/repo_template/` → 199 passed（197 基线 + 2 新增，满足 AC3「既有 197 用例通过」）。无 `.skip` / `.only` / 恒真 / 弱化断言。

### 改测方向复核

无。本轮改动为新增失败路径用例、既有（上轮新增的）fsync 用例更名并**加强**断言（补 tmp 清理检查），无「把断言迁就当前实现」式改测。replace 失败用例（116-124）与 fsync 失败用例均断言目标保持原样 + tmp 清理，符合 AC1/AC3 的用户可观察行为要求。

### 本轮新发现

0 条。

### 未进表的提示

- 实现侧 `except BaseException` 内若 `unlink` 抛非 `OSError` 会掩盖原异常——`unlink` 实际只可能抛 `OSError` 系，属不可达边界，提示不阻断。
- AC2（`rebuild_index` 派生索引 JSON 原子写）仍无直接失败路径用例，经共享 `_atomic_write_text` 与 `write_front_matter` 同路径触达，Round 1 已认定覆盖可接受，维持。

### 总体判断

Round 1 blocker t179_test_f001 已消除：实现 try 块覆盖写盘+replace 全阶段并统一清理 tmp，测试补 tmp 清理断言且实测通过（回归有效），全量 199 绿。无未解决 critical / important。

### 系统性 follow-up

无。

verdict: PASS

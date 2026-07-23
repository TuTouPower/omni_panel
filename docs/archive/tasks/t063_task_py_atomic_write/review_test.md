# Task review t063（reviewer_focus: 测试）

- task：`t063_task_py_atomic_write`
- spec：`docs\tasks\t063_task_py_atomic_write\spec.md`
- diff_anchor：`a69a12e32707bb51a9562ad7777adf27119170bb`
- target：`git diff a69a12e32707bb51a9562ad7777adf27119170bb`
- round：1
- reviewed_at：2026-07-23 20:34 UTC+8

## 仓库/范围确认

- 仓库根：`D:/Dev/Code/omni_usage`，分支 `t063_task_py_atomic_write`，与 task 目录所属一致。
- diff 仅 3 文件：`scripts/task.py`（+10/-3）、`docs/tasks_index.json`、`docs/tasks/t063_task_py_atomic_write/task.md`。**无任何测试文件新增/修改/删除**。
- 项目测试基建核查：`package.json`/`docs/guides/testing.md` 仅含 vitest/Playwright/TS 栈；无 `pyproject.toml`/`pytest.ini`/`requirements*.txt`/`test_*.py`（`Glob **/test_*.py` 命中仅 `node_modules` 内 node-gyp 自带文件，与本项目无关）。确认：**项目无 Python 测试基建**。

## 测试可测性判断（回答用户提的元问题）

- **Python 脚本改动可测吗**：可测。`save`/`cmd_finish`/`cmd_drop`/`_move_to_archive` 是纯函数+CLI 入口，pytest + `monkeypatch`（mock `os.replace`/`os.fsync`）或 `tmp_path` fixture 即可覆盖原子写与事务顺序；亦可在 vitest 内 `child_process.execFile('python', ['scripts/task.py', ...])` 做黑盒。
- **是否需要补 Python 测试**：是。`spec.md:21` AC3 明文要求"单测覆盖：模拟写中断（mock os.replace 失败）不损坏 JSON"，非可选。
- **smoke 是否充分**：不充分。用户描述的 smoke（add/start/list/finish 跑通）只触达 AC4 happy path，对 AC1（原子性）/AC2（中断可恢复）/AC3（mock 失败）零覆盖。
- **N/A 是否合理**：不合理。AC3 是 spec 契约；"无既有 Python 测试框架"是事实，但应在 plan.md 阶段前置提出（引入最小 pytest 桩 / 或改用 vitest 子进程），而非静默跳过 AC。本 task 不是"纯文档 task"（prompt 第 46 行豁免不适用，因为改了生产代码 `scripts/task.py`）。

## Findings

### t063_test_f001 - AC3 明示的"mock os.replace 失败"单测完全缺失

- 严重度：important
- 位置：`docs/tasks/t063_task_py_atomic_write/spec.md:21`（AC3 行）→ 对应实现 `scripts/task.py:53-61`
- 问题：AC3 写明"单测覆盖：模拟写中断（mock os.replace 失败）不损坏 JSON"。`git diff a69a12e32707bb51a9562ad7777adf27119170bb` 无任何测试文件新增/修改。实现确实改成 tmp+fsync+os.replace，但 AC3 是"测试覆盖"AC，不是"实现"AC——实现完成不等于 AC 满足。无任何证据表明 mock `os.replace` 抛 `PermissionError`/`OSError` 时：(a) `ACTIVE_PATH` 仍是上一版可解析 JSON；(b) 残留 `tasks_index.json.tmp` 不会被下次 save 误用；(c) `os.replace` 真被调用（而非被某分支跳过）。"项目无 Python 基建"不构成豁免——spec 是契约，基建缺失应在 plan 阶段暴露。
- 建议：引入最小 pytest 桩（`tests/scripts/test_task_py_atomic.py` + `pyproject.toml` 最小配置）或在 vitest 内 `child_process` 调 python 子进程。最小用例：`monkeypatch.setattr(os, "replace", lambda *a: raise OSError("simulated"))`，调用 `save(path, {"tasks": []})`，断言 (1) 抛 `OSError`；(2) `path` 仍可 `json.loads` 且为旧内容；(3) 旧文件 inode/内容未变。

### t063_test_f002 - AC2 事务恢复行为零验证，且实现语义存疑需测试定调

- 严重度：important
- 位置：`scripts/task.py:160-184`（`cmd_finish`/`cmd_drop`）对照 `spec.md:20`
- 问题：AC2 "finish/drop 中断后重跑可恢复（不留 active 与 archive 共存）"。实现仅把顺序改成"先 archive 后 active"并以注释自证（`scripts/task.py:167`、`scripts/task.py:181`），**无任何行为测试**。更关键：现实现下若 `_move_to_archive` 成功（archive 已落盘）后 `save(ACTIVE_PATH, data)` 中断，磁盘状态 = active 旧版（仍含 tid, status=active）+ archive 新版（含 tid, status=done），二者**共存**——正是 AC2 禁止的状态。重跑 `finish` 会先进 `require_status(t, "active")` 通过，再在 `_move_to_archive` 内 `scripts/task.py:154` `sys.exit(f"{tid} already exists in archive ...")` 退出，并非"可恢复"。该语义究竟是"已恢复"还是"硬阻塞"，需测试钉死——但 diff 中无此测试。
- 建议：补集成测试模拟"\_move_to_archive 落盘后、save(ACTIVE) 前中断"（pytest + monkeypatch 在第二步 save 抛错），再调 `cmd_finish` 重跑，断言要么完成清理（active 去掉 tid）、要么给出明确可执行修复指引。若实现确无自动恢复路径，应回退给 code reviewer / spec 走"或加恢复入口"分支（spec.md:11 非范围已留这选项）。

## 结论

- 前轮 finding 复核：N/A（Round 1）。
- 本轮新发现：2 条（均 important，AC 覆盖缺口）。
- 总体判断：本 task 不是纯文档 task，改了 `scripts/task.py` 生产代码，spec AC3 明示"单测覆盖 mock os.replace 失败"，diff 却零测试文件。无 Python 基建不豁免契约性 AC。"无新增测试"在当前 spec 下不可接受——要么补 Python 测试（AC3/AC2），要么 plan.md 阶段就应把 AC3 改写或显式降级（implementer 未走此路径）。smoke 仅覆盖 AC4，不能抵 AC1/AC2/AC3。

verdict: FAIL

## Round 2 (2026-07-23 20:55 UTC+8)

### 前轮 finding 复核

- **t063_test_f001（AC3 mock os.replace 失败单测缺失）**：**未修**。R1 后新增 `tests/unit/scripts/task_py.test.ts` 共 4 用例，无一 mock `os.replace` 失败：
    - 用例 1「save leaves no .tmp residue after add」：仅断言 `add` 成功后 temp_dir 无 `.tmp` 文件，是 happy path 副产物，未触发失败路径。
    - 用例 2「JSON is valid after write」：仅断言 `add` 后 JSON 可解析、长度=1；实现若退回 `path.write_text` 此断言仍通过。
    - 用例 3、4 是 AC2 恢复与正常 finish，与 AC3 无关。
    - spec.md:21 AC3 字面契约「模拟写中断（mock os.replace 失败）不损坏 JSON」仍零证据。需验证的最小行为：(a) `os.replace` 抛 `OSError` 时原 `active.json` 内容未变；(b) 异常向上传播（不静默）；(c) 残留 `.tmp` 不被下次 save 误用。
    - 可行实现路径：构造父目录只读 / 目标路径跨卷 / Windows 保留名（`CON`、`NUL`）触发真实 `os.replace` 失败；或引入最小 pytest 桩 `monkeypatch.setattr(os, "replace", ...)`。
    - 严重度维持 important（AC 契约缺口，非危险模式）。

- **t063_test_f002（AC2 事务恢复零验证）**：**已修**。用例 3「re-moves archive coexistence」手动构造 `active.tasks[0].status="active"` + `archive.tasks[0].status="done"` 同 tid 共存（`tests/unit/scripts/task_py.test.ts:53-73`），重跑 `finish t001` → 断言 exit=0、`active_after.tasks.length=0`、`archive_after.tasks.length=1`。对应实现路径 `scripts/task.py:157-163`（archive 已含时先 `data["tasks"] = [...]` 清 active 再 `return t`，不重写 archive），恢复语义被钉死。

### 本轮新发现

0 条。新加测试代码本身无危险模式（无 `.skip`/`.only`/`@ts-ignore`/恒真断言/弱化断言/mock 被测逻辑）；mock 边界合法（`execFileSync` 黑盒 + 文件系统层构造状态，未 mock 内部函数）。`try { run(...) } catch { exit_code = 1 }` 模式配合 `expect(exit_code).toBe(0)` 仍会因子进程抛错而断言失败，非静默吞错。

### 范围外提示（不进 finding 表）

- AC2 字面包含 finish 与 drop；现仅覆盖 finish。`_move_to_archive` 是共享恢复路径，finish 用例已钉死核心逻辑，drop 未单独覆盖影响低。若后续要求严格双路径覆盖可补一条 drop 恢复用例。

### 总体判断

f002 修到位，但 f001（AC3 mock os.replace 失败单测）完全未触及——implementer 声称「4 用例绿」不构成 AC3 证据，4 用例无一模拟写中断。AC3 是 spec 契约性 AC，不可用 happy path 副产物抵充。

verdict: FAIL

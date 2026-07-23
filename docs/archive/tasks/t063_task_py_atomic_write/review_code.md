# Task review t063（reviewer_focus: 代码）

- task：`t063_task_py_atomic_write`
- spec：`docs\tasks\t063_task_py_atomic_write\spec.md`
- diff_anchor：`a69a12e32707bb51a9562ad7777adf27119170bb`
- target：`git diff a69a12e32707bb51a9562ad7777adf27119170bb`
- round：1
- reviewed_at：2026-07-23 14:50 UTC+8

## Findings

### t063_code_f001 - finish/drop 在 save(ACTIVE) 失败时仍留共存，重跑被 \_move_to_archive 拒绝，违反 AC「中断后重跑可恢复」

- 严重度：important
- 位置：`scripts/task.py:153-154`（`_move_to_archive` 去重检查）、`scripts/task.py:168-169`（`cmd_finish`）、`scripts/task.py:182-183`（`cmd_drop`）
- 问题：实现选 spec 选项 1「先 archive 后 active」，把原版 3 次磁盘写压缩为 2 次，但**核心 race 未消除**。场景：`_move_to_archive` 内 `save(ARCHIVE_PATH, arc)` 已成功落盘（archive 已有该 tid），随后 `save(ACTIVE_PATH, data)` 在 `open` / `os.fsync` / `os.replace` 任一步失败（断电、磁盘满、权限、杀进程）。
    - 失败后状态：`docs/archive/tasks_index.json` 含 tid，`docs/tasks_index.json` 也仍含 tid（目标文件未被 replace，保留原内容）→ **active 与 archive 共存**。
    - 重跑 `task.py finish <tid>`：`require_status(t, "active")` 通过，但 `_move_to_archive` 撞 `if find(arc["tasks"], tid): sys.exit(f"{tid} already exists in archive (数据冲突，请提示用户)")` 直接退出，无法恢复。
    - 此路径要求用户手工编辑 JSON，违反 `CLAUDE.md` 硬约束「`docs/tasks_index.json` 与 `docs/archive/tasks_index.json` 只能由 `scripts/task.py` 修改；agent 禁止直接编辑这两个 JSON」。
    - 与 spec AC「finish/drop 中断后重跑可恢复（不留 active 与 archive 共存）」直接冲突：选项 1 仅缩小窗口，不消除共存；spec 明确给出「**或**加恢复入口（检测 active 与 archive 同 tid 共存时修复）」作为替代，实现未采用，也未补恢复逻辑。
- 建议：在 `_move_to_archive` 或 `cmd_finish`/`cmd_drop` 开头加幂等恢复——检测「同 tid 在 active 与 archive 共存」时，视为前次 finish/drop 的残留重放：跳过 archive append，仅完成 active 侧 remove 并打印告警。或按 spec 选项 2 增加显式恢复子命令。最小修复（选项 A，幂等 `_move_to_archive`）：

    ```python
    def _move_to_archive(data: dict, tid: str) -> dict:
        arc = load(ARCHIVE_PATH)
        t = find(data["tasks"], tid)
        if not t:
            # active 已无 tid：前次重放完成，archive 应已存在
            existing = find(arc["tasks"], tid)
            if existing:
                print(f"warn: {tid} already archived; active already clean (recovery no-op)")
                return existing
            sys.exit(f"{tid} not found in active tasks")
        data["tasks"] = [x for x in data["tasks"] if x["tid"] != tid]
        if find(arc["tasks"], tid):
            # 共存恢复：archive 已落盘，只补 active 侧清理（save 由调用方完成）
            print(f"warn: {tid} already in archive; cleaning active side (recovery)")
            return t
        arc["tasks"].append(t)
        save(ARCHIVE_PATH, arc)
        return t
    ```

## 结论

- 本轮新发现：1 条（important）
- 总体判断：save 原子写（I16）正确落地，同目录 tmp 满足 Windows 约束；但 finish/drop 仅做了顺序调整，未补恢复入口，save(ACTIVE) 失败时仍留共存且重跑被 `_move_to_archive` 去重检查拒绝，spec AC「中断后重跑可恢复（不留共存）」未达成。

verdict: FAIL

## Round 2 (2026-07-23 20:55 UTC+8)

### 前轮 finding 复核

- **t063_code_f001：已修**。`_move_to_archive` 在 `t in active` 主路径上加了幂等分支（`scripts/task.py:158-160`）——当 archive 已含 tid 时跳过 append+save，直接返回，由调用方完成 `save(ACTIVE_PATH)` 清理 active 侧。f001 描述的核心场景（save ARCHIVE 成功 + save ACTIVE 失败 → 重跑）已被覆盖：
    1. 首次 `cmd_finish`：`t["status"]="done"` 仅内存改；`_move_to_archive` append+save ARCHIVE 成功；`save(ACTIVE_PATH, data)` 失败 → 落盘状态：archive 含 t(status=done)，active 含 t(status=active，因 status 改动未落盘)。
    2. 重跑 `cmd_finish`：`require_status(t,"active")` 通过（active 落盘仍是 active）；`_move_to_archive`：`find(arc["tasks"],tid)` 命中第 158 行 → `return t` 跳过 archive 再写；`save(ACTIVE_PATH, data)` 成功 → active 清除。**无共存，AC 达成**。
    - 补充：`cmd_drop` 同路径，同样可恢复。
    - 补充：`if not t:` 分支（`scripts/task.py:149-156`）为防御性死代码——`cmd_finish:169-170` 与 `cmd_drop:182-183` 在调用 `_move_to_archive` 前 `if not t: sys.exit(...)` 已兜底，进入 `_move_to_archive` 时 `find(data["tasks"],tid)` 必非 None。当前 CLI 下不可达，但无害，保留可作为函数复用兜底。不计 finding。

### 本轮新发现

无。

### 本轮改动复核（a69a12e..HEAD 相对工作区，仅 `scripts/task.py`）

- `ACTIVE_PATH/ARCHIVE_PATH` 支持 env override（`scripts/task.py:30-31`）：`os.environ.get(...)` 双取，空值回退默认。`Path(os.environ.get("OMNI_TASK_ACTIVE_PATH", "")) if os.environ.get("OMNI_TASK_ACTIVE_PATH") else ...` 写法保证空串不走 `Path("")` 相对路径陷阱。测试隔离用，生产行为不变。
- `import os`（`scripts/task.py:24`）：fsync/replace 所需，必要。
- `save`（`scripts/task.py:53-61`）：tmp 与目标同目录（`path.with_suffix(path.suffix + ".tmp")`），满足 Windows 同卷约束；fsync 在 close 前、replace 在 close 后，原子性正确。失败时 tmp 残留属资源清理问题，不损坏权威 JSON，非本 task 引入，不计 finding。

## 结论

- 前轮 finding 复核：f001 已修。
- 本轮新发现：0 条。
- 总体判断：幂等恢复分支正确落地 f001 场景，重跑不再留共存；env override 与 import os 为合理配套。无新增代码质量问题。

verdict: PASS

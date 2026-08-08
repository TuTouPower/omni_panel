---
tid: "t264"
slug: "session_index_batched_persist"
title: "会话索引落盘批间合并（消除 miss 全量写）"
status: "done"
branch: "t264_session_index_batched_persist"
worktree: ""
review_level: "full"
diff_anchor: "805e7c1a8c7b8fd75b374b86062f961b3ce822da"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- SPIKE s024：确定落盘批间合并机制 = dirty 标记 + debounce flush（50ms）。原型验证批量 N=50 persist → 1 次写盘；未命中且内容不变零写；显式 flush 保证落盘；单 miss 删+填合并。结论写 spec 上下文区。
- 实现：`session-locator.ts` 加 `index_dirty_dir` / `index_flush_timer` 模块级状态。`persist_index_entry` 仅当索引内容实际变化（set / delete 存在的 key）置 dirty 并 schedule debounce flush；delete 不存在的 key 直接 return（零写盘）。新增导出 `flush_session_index()`（无参，flush 当前 dirty dir），`clear_resolution_cache` 清 dirty 与 timer。`index.ts` before-quit 加 `flush_session_index()`。
- 既有测试语义适配（spec AC5 允许，调整理由）：原 `persist_index_entry` 每次同步写盘，测试依赖「resolve 后立即 existsSync / read_index」。改 debounce 后：
    - 各「resolve 后 clear_resolution_cache」处先 `flush_session_index()`（AC1/AC2 删除/AC2 moved/损坏重建/f003），保证磁盘索引含 resolve 结果供跨重启命中。
    - AC3 首断言原依赖「未命中也写盘建文件」——新语义未命中零写不建文件，改为先 resolve 命中会话创建索引文件，再断言未命中会话不入索引。
- 新测试 3 例：单 miss 至多一次写盘 + 未命中零写（spy save_session_index）；批量 N=50 resolve → flush 后 1 次写盘且含全部 N 条目；单 miss 删失效+回填合并一次写盘。
- review code f001：dirty 单槽全局态在 50ms 窗口内切换 index_dir 时，旧 dir 待落盘条目被覆盖丢失（生产单目录不触发，多 index_dir 潜在缺陷）。修复：`schedule_index_flush` 同时保存脏 map 引用 `index_dirty_map`；切 dir 时 flush 用该引用落盘旧 dir。
- review code f002：`flush_session_index` 原用 `ensure_session_index` 取当前 map，命中早退路径切 dir 后旧 dir 条目丢失；改用 `index_dirty_map` 引用落盘，删除重复的 `flush_current_dirty_dir`。补「命中早退路径 flush 旧 dir」精确测试。
- typecheck 既有 p088（local-api/server.ts TS4111）3 处存量，非本 task 引入。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-08 15:25 UTC+8)

| finding_id     | severity | status | rationale                                                                                                                                                 | fix_ref                                                     |
| -------------- | -------- | ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| t264_code_f001 | minor    | 已修   | dirty 单槽切 index_dir 丢旧 dir 条目；schedule 保存 map 引用，切 dir 先 flush 旧 map                                                                      | session-locator.ts schedule_index_flush/flush_session_index |
| t264_code_f002 | minor    | 已修   | flush_session_index 用 ensure_session_index（当前 map）而非保存引用，命中早退路径丢旧 dir 条目；改用 index_dirty_map 引用，删重复 flush_current_dirty_dir | session-locator.ts flush_session_index                      |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1/2（单 miss 至多一次写盘、未命中不变零写）：`save_session_index` spy 断言——冷会话 resolve + flush 后 1 次写；未命中且 key 不存在 delete 零写。
    - AC2（批量 resolve N 冷会话写盘显著 < N）：批量 50 个冷会话 resolve，flush 后 `save_session_index` 恰 1 次调用，索引文件含全部 50 条目。
    - AC3（持久性不弱化）：`flush_session_index` 退出路径（before-quit）显式落盘；既有 AC1 跨重启命中 readdir 计数=0 保持通过。
    - AC4（崩溃丢未落盘可接受，回退扫描重建）：删除索引文件后 resolve 回退扫描重建，既有损坏重建测试通过。
    - AC5（测试按新语义调整全过）：既有 t254 测试补 flush 语义、AC3 首断言调整（未命中零写不建文件）；全量 `pnpm test` 2651 passed / 8 skipped。

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：PASS（f001 主复现消除，新增 f002）
- Round 3 code：PASS（f001/f002 均消除，独立实证）

### 结果摘要

- 会话索引落盘从「每次 persist 同步全量写」改为 dirty + debounce（50ms）合并，批量冷解析写盘次数由 O(N) 降为 O(1)；未命中不变零写；退出路径显式 flush 保证持久性。切 index_dir 与命中早退路径用保存 map 引用落盘防条目丢失。

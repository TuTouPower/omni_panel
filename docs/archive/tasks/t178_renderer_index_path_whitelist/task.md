---
tid: "t178"
slug: "renderer_index_path_whitelist"
title: "完整 rendererIndexPath 白名单"
status: "done"
branch: "t178_renderer_index_path_whitelist"
worktree: ""
review_level: "full"
diff_anchor: "60559e4e383f89cad4b60596ef6b86d84b912841"
depends_on: ""
conflicts_with: ""
note: "p006"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- doctor：无（testing.md 声明本仓无独立 doctor_cmd）。
- SPIKE 实验（2026-08-01）：移除 helpers.ts:44 `endsWith("index.html")` fallback，未初始化时拒绝一切 file:// sender（生产 main/index.ts:126 启动即 set_renderer_index_path）。6 个 IPC 测试文件失败（event/connector-ipc-sender/token-stats/popup/config/grok_auth），valid sender 均为 `file:///index.html` 未初始化路径。
- 修复：各测试显式 `set_renderer_index_path("D:/app/out/renderer/index.html")` + sender 改生产格式；popup-ipc/token-stats-ipc 因 `vi.resetModules()` 清模块缓存，beforeEach 动态 import helpers 后重新初始化。helpers.test.ts 新增「未初始化拒绝 file://」用例（红→绿）+ 旧「allows packaged pages」改「未初始化拒绝」。
- 验证：全量 `pnpm test` 187 files / 1965 passed / 1 skipped；`tsc`、lint 通过。
- 环境：worktree 需 `pnpm install` + `pnpm rebuild better-sqlite3` + `tsx scripts/gen-build-info.ts`（见 findings d006）。

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

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

### Round 1 (2026-08-01 12:20 UTC+8)

| finding_id     | severity | status | rationale                                                                   | fix_ref                            |
| -------------- | -------- | ------ | --------------------------------------------------------------------------- | ---------------------------------- |
| t178_code_f001 | minor    | 已修   | 未初始化与 pathname 不匹配守卫合并为单一条件，消除重复错误串                | src/main/ipc/helpers.ts:39         |
| t178_test_f001 | minor    | 已修   | I15 测试显式 set_renderer_index_path 后断言非 index.html 路径拒绝，恢复原意 | tests/unit/ipc/helpers.test.ts:200 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC1：helpers.ts 移除未初始化 endsWith fallback，未初始化拒绝一切 file:// sender（新增 helpers.test.ts 用例红→绿；旧「allows packaged pages」改「未初始化拒绝」）。
    - AC2：已初始化精确 pathname 比对不变（t067 用例保留）；7 个 IPC 测试文件显式 set_renderer_index_path + sender 改生产格式。
    - AC3：全量 `pnpm test` 187 files / 1965 passed / 1 skipped；`tsc`、lint 通过。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（1 minor：f001 已修）
- Round 1 test：PASS（1 minor：f001 已修）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

未初始化 rendererIndexPath fallback 移除，file:// sender 一律严格校验；p006 闭环。

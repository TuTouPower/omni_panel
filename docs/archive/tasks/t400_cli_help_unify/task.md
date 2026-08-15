---
tid: "t400"
slug: "cli_help_unify"
title: "CLI 帮助单一真相源:四入口输出统一含 --gui"
status: "done"
branch: "t400_cli_help_unify"
worktree: ""
review_level: "full"
diff_anchor: "66b8d5a375ee63bc729bb9e25d693aeed9a3d514"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: "无参/--help/help/--cli help 四入口输出同一份帮助(含 --gui);消除 launcher 与主进程两处内联帮助文本"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 需求确认（2026-08-16，用户）

- 现有帮助三处不一致：`omni_panel --help`/无参（launcher，含 --gui）、`omni_panel help`（主进程 --cli help，漏 --gui）。
- 用户明确：不要打补丁式的「launcher 拦截 help」，要**统一为单一真相源**，四个入口（无参/--help/help/--cli help）输出完全同一份帮助。
- 不关心改动大小，只关心架构正确。

实施步骤执行期记录。

### 实施（2026-08-16 02:35 UTC+8）

- doctor_cmd：无。
- s029：候选 A 可行——主进程 import `scripts/*.mjs` 构建期内联（esbuild/vite 实测 + `pnpm build` 产物含 `CLI_HELP_TEXT`）。finding d038。
- 实现：`scripts/cli_help.mjs` 单一真相源；launcher / 主进程 import；`help` 子命令 → launcher `mode: help`（不转发）；`--cli help` 主进程打印同一常量。
- 测试：`tests/unit/scripts/cli_help.test.ts` + 更新 `launcher_arg_translate.test.ts`；相关 + 全量 `pnpm test` 绿。
- 黑盒：launcher 四入口 md5 一致；`electron . --cli help` 与 launcher 字节一致；AC-005 `[deploy]` 未跑 `make:linux`。
- review round 1 code+test PASS，零 finding。
- 工具链缺陷（任务结束后汇报）：`spikes.py new` 因历史 s004 编号重复失败，本 task 手建 s029。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-16 02:35 UTC+8)

Round 1 零 finding，未进处置表。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足（AC-005 `[deploy]` 标注人工/打包验证）
- 证据：见 `handoff.json` `ac_evidence`（四入口 mode + 共享文本 + electron 字节比对 + 源码去内联 + build 内联）

### Reviewer verdict

`full`：

- Round 1 code：PASS
- Round 1 test：PASS

### 结果摘要

- CLI 帮助收敛到 `scripts/cli_help.mjs`；launcher 四入口与 `--cli help` 输出一致（含 `--gui`）。

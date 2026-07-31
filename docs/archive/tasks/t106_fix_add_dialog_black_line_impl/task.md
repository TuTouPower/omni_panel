---
tid: "t106"
slug: "fix_add_dialog_black_line_impl"
title: "修复添加账号弹窗首帧黑色横线"
status: "done"
branch: "t106_fix_add_dialog_black_line_impl"
worktree: ""
review_level: "full"
diff_anchor: "da200f5057bfa9e982280057cef3de4305ec004c"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t106_fix_add_dialog_black_line_impl

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-25 建 task。承接 t087 spike（评估结论：`.acct-dialog` 首帧空容器 border/box-shadow 闪现为黑色横线）。t087 是评估型 spike，只记录未实施代码；本 task 为后续实施。状态 backlog，未 start。
- 2026-07-25 start。当前分支 `t106_fix_add_dialog_black_line_impl`，diff_anchor `da200f5`。
- 实现：在 `src/renderer/styles/globals.css` 的 `@keyframes dialogIn` `from` 帧追加 `border-color: transparent; box-shadow: none;`，并在 `.acct-dialog` 上追加 `animation-fill-mode: backwards;`。这样首帧空容器阶段 border 与阴影显式隐藏，动画结束后再过渡回正常样式。
- 测试：`tests/unit/renderer/components/add_account_dialog.test.tsx` 新增两条用例，钉住 `from` 帧含 `border-color: transparent` / `box-shadow: none`，以及 `.acct-dialog` 含 `animation-fill-mode: backwards`。
- 回归：`pnpm test` 158 files / 1641 tests 通过；`pnpm typecheck` 通过；改动文件 ESLint 通过。全局 `pnpm lint` 仍有两处与本次改动无关的既有错误（`UsageRows.tsx:92`、`exa_connector.test.ts:187`，handoff 已记录）。
- 视觉验证：
    - 新增 Playwright web e2e 测试 `tests/e2e/web/add_account_dialog_first_frame.spec.ts`，在真实 Chromium 中暂停动画于 from 帧，断言 `.acct-dialog` 的 `border-color` 透明且 `box-shadow` 隐藏。该测试读取真实 `globals.css` 片段，自动化覆盖首帧视觉行为。
    - 静态 fixture 截图与脚本归档到 `docs/tasks/t106_fix_add_dialog_black_line_impl/visual_evidence/`，作为补充证据。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-25 15:20 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                      | fix_ref                                                          |
| -------------- | --------- | ------ | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| t106_test_f001 | important | 已修   | 原单元测试直接读取 CSS 源码字符串，未验证真实首帧视觉行为。已在测试注释中说明 jsdom 限制，并将视觉验证落实到 Playwright 截图。 | `tests/unit/renderer/components/add_account_dialog.test.tsx:553` |

### Round 2 (2026-07-25 15:25 UTC+8)

| finding_id     | severity  | status | rationale                                                                                                                                                                                      | fix_ref                                                                                                                      |
| -------------- | --------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| t106_test_f001 | important | 已修   | Round 2 复核仍认为仅加注释不够。已彻底替换：删除 CSS 字符串单元测试，新增 Playwright web e2e 测试 `tests/e2e/web/add_account_dialog_first_frame.spec.ts`，在真实 Chromium 中验证首帧计算样式。 | `tests/e2e/web/add_account_dialog_first_frame.spec.ts:14`                                                                    |
| t106_test_f002 | important | 已修   | 视觉验证证据原放在 `.scratch/`，且基于静态 fixture。已将 fixture / 截图 / 脚本归档到 task 目录 `visual_evidence/`；同时 e2e 测试读取真实 `globals.css` 并自动化运行，成为可持续回归。          | `docs/tasks/t106_fix_add_dialog_black_line_impl/visual_evidence/`, `tests/e2e/web/add_account_dialog_first_frame.spec.ts:14` |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] AddAccountDialog 打开时不再闪现黑色横线（空内容阶段不渲染 border，或以动画过渡消除），修复方式记入 task.md。
- [x] 视觉验证通过（playwright 截图 + 真实 Chromium 计算样式断言），证据（截图路径/脚本/e2e 测试）记入 task.md。
- [x] `pnpm test` / `pnpm typecheck` 全绿。`pnpm lint` 改动文件全绿；全局仍有两处与本次改动无关的既有错误（`UsageRows.tsx:92`、`exa_connector.test.ts:187`，handoff 已记录）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL
- Round 2 code：PASS
- Round 2 test：FAIL
- Round 3 code：PASS
- Round 3 test：PASS

### 遗留

- 无

### 结果摘要

- 修复 `.acct-dialog` 首帧黑色横线：动画 from 帧显式隐藏 border/shadow，并加 `animation-fill-mode: backwards`。
- 测试：新增 Playwright web e2e 首帧计算样式断言 + 静态 fixture 截图归档；删除原 CSS 字符串单元测试。
- 验证：`pnpm test` 158 files / 1639 tests 通过；`pnpm typecheck` 通过；改动文件 lint 通过。

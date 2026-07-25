---
tid: t106
slug: fix_add_dialog_black_line_impl
diff_anchor: "<开干时填>"
branch: ""
---

# Task t106_fix_add_dialog_black_line_impl

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 2026-07-25 建 task。承接 t087 spike（评估结论：`.acct-dialog` 首帧空容器 border/box-shadow 闪现为黑色横线）。t087 是评估型 spike，只记录未实施代码；本 task 为后续实施。状态 backlog，未 start。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] AddAccountDialog 打开时不再闪现黑色横线（空内容阶段不渲染 border，或以动画过渡消除），修复方式记入 task.md。
- [ ] 视觉验证通过（playwright 截图或打包后人工确认），证据（截图路径或观察记录）记入 task.md。
- [ ] `pnpm test` / `pnpm typecheck` / `pnpm lint` 全绿。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 待补充

---
tid: t099
slug: popup_width_cap_remove
diff_anchor: "3aabba4084c8d16d025a14b063b9979e0effe3b4"
branch: t099_popup_width_cap_remove
---

# Task t099_popup_width_cap_remove

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：用户反馈用量面板宽度被硬编码 clamp 到 780px，无法拉到 1:3 高宽比。`d723d3d` (2026-06-06) 把上限从 460 拉到 780 是临时取值，从未支持任意宽度。本 task 移除/放宽 maxWidth。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-24 12:54 UTC+8)

| finding_id     | severity  | status | rationale                                                     | fix_ref                                             |
| -------------- | --------- | ------ | ------------------------------------------------------------- | --------------------------------------------------- |
| t099_test_f001 | important | 已修   | 增加浮动窗口重启恢复 1200px 与 usage 无 `maxWidth` 回归用例。 | `tests/unit/main/main_panel_controller.test.ts:184` |

### Round 2 (2026-07-24 13:04 UTC+8)

零 finding；Round 1 的 `t099_test_f001` 已修。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] floating 模式下用户拖宽度可超过 780px，重启后 floatingBounds 保留用户设置的宽度。
- [x] popup 模式下用户拖宽度可超过 780px（仅 minWidth=472 限制）。
- [x] `WINDOW_CONFIGS.usage.maxWidth` 不再限制用户 resize（移除或调整为合理上限）。
- [x] `main_panel_controller.test.ts` 新增用例：模拟用户 resize 到 1200px，`save_floating_bounds` 持久化的 width 为 1200，不被 clamp。
- [x] `pnpm test` 全量通过。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：FAIL（`t099_test_f001` 已修）
- Round 2 code：PASS
- Round 2 test：PASS

### 遗留

- 无

### 结果摘要

- 移除 usage 窗口固定最大宽度；floating 宽度保存与恢复以上次所在 display 的 `workArea.width` 为上限。
- 单元测试覆盖 1200px 保存、重启恢复与 usage 无 `maxWidth`；`pnpm test` 158 files / 1618 tests、`pnpm typecheck`、改动文件 Prettier 通过。
- 已验证 `pnpm package && pnpm test:packaged`（3 passed）与隔离 Electron 实机 resize 行为。
- `pnpm check` 因未改动的 `UsageRows.tsx` 和 `exa_connector.test.ts` 既有 lint 错误未通过。

---
tid: t099
slug: popup_width_cap_remove
diff_anchor: "<SHA>"
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

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] floating 模式下用户拖宽度可超过 780px，重启后 floatingBounds 保留用户设置的宽度。
- [ ] popup 模式下用户拖宽度可超过 780px（仅 minWidth=472 限制）。
- [ ] `WINDOW_CONFIGS.usage.maxWidth` 不再限制用户 resize（移除或调整为合理上限）。
- [ ] `main_panel_controller.test.ts` 新增用例：模拟用户 resize 到 1200px，`save_floating_bounds` 持久化的 width 为 1200，不被 clamp。
- [ ] `pnpm test` 全量通过。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 待补充

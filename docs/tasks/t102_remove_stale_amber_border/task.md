---
tid: t102
slug: remove_stale_amber_border
diff_anchor: "<SHA>"
branch: t102_remove_stale_amber_border
---

# Task t102_remove_stale_amber_border

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：用户要求卡片报错/stale 时不要再渲染黄色边框，只保留报错信息文字。位置 `globals.css:615-617` `.card.stale { border-color: color-mix(amber 34%) }`，触发于 `ProviderCard.tsx:117`。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] 卡片报错或 stale 时，卡片外圈不再有黄色边框；只显示错误信息或「已过期」徽章。
- [ ] 正常卡片样式不受影响。
- [ ] `pnpm test` 全量通过；如有断言 `.card.stale` 的测试同步更新。

### Reviewer verdict

- Round 1 code：PASS / FAIL
- Round 1 test：PASS / FAIL
- Round 2 code：N/A / PASS / FAIL
- Round 2 test：N/A / PASS / FAIL

### 遗留

- 无

### 结果摘要

- 待补充

---
tid: t100
slug: l2_state_reset_on_collapse
diff_anchor: "<SHA>"
branch: t100_l2_state_reset_on_collapse
---

# Task t100_l2_state_reset_on_collapse

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 2026-07-24 创建 task。背景：多账号卡片折叠后再展开仍停留「N账号」而非「概览」。根因 `ProviderCard.tsx:119` `l2open` 是 useState，与 `expanded` 正交但未定义折叠时语义。`804e3c2` (2026-06-09) 引入 L2 seg 时留下的设计漏洞。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [ ] 多账号卡片展开 → 点「N账号」→ 折叠 → 再展开，显示「概览」内容，L2 高亮在「概览」。
- [ ] `provider_card.test.tsx` 新增用例覆盖上述序列。
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

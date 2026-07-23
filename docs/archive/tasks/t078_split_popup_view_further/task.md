---
tid: t078
slug: split_popup_view_further
diff_anchor: "<SHA>"
branch: t078_split_popup_view_further
---

# Task t078_split_popup_view_further

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 来源：t043 review `t043_code_f001`（minor，遗留）——`PopupView.tsx` 超阈值，治本需独立重构。t044 一轮拆分后当前 783 行，仍超 400 行 minor 阈值。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t078` 查，不在此记。

### 验收标准勾选

- [ ] `PopupView.tsx` ≤ 400 行，或记录不可拆硬约束并说明剩余构成。
- [ ] 新拆出的实现源码文件均 ≤ 400 行。
- [ ] 既有单测全绿（`pnpm test`），必要时仅调整 import 路径。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过。

### Reviewer verdict

- Round 1 code：N/A
- Round 1 test：N/A

### 遗留

- 无

### 结果摘要

- 待填

---
tid: t086
slug: fix_bell_visibility_layout
diff_anchor: "278247c"
branch: "t086_bell_fix"
---

# Task t086_fix_bell_visibility_layout

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

- 无

## Review 处置

### Round 1 (2026-07-24)

CSS + opacity 改动，不走双审。

## 收尾报告

### 修复

1. `.bar-row` / `.bar-row.frac` / `.bar-row.capsule` grid-template-columns 加 `auto` 末列（bell 不再换行）。
2. 新增 `.bar-watch` CSS（22×22 inline-flex + hover 样式）。
3. opacity 0.35 -> 0.5（未 watched 时更可见）。

### 验收标准勾选

- [x] bell 与刷新时间同行（grid auto 末列）。
- [x] CSS class `.bar-watch` 有完整样式。
- [x] opacity 0.5 更可见。
- [x] typecheck + 黑盒 1594 全绿。

### 结果摘要

- bell 同行 + CSS class 修 + opacity 提高。

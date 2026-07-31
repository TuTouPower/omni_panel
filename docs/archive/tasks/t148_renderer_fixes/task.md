---
tid: "t148"
slug: "renderer_fixes"
title: "renderer 修复：占位按钮置灰 + 契约小修"
status: "done"
branch: "t148_renderer_fixes"
worktree: ""
review_level: "full"
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
depends_on: ""
conflicts_with: ""
schedule_status: ""
note: ""
---

# Task t148_renderer_fixes

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 完成 6 项 renderer 修复：占位按钮 disabled + 暂未开放、`about_section` 外部链接 noopener、托盘分隔符字段化、`refresh_providers` 前置、`record_bool_equal` 替换 JSON.stringify、token-stats spec 补充独立持久化说明。
- Round 1 双审均 PASS，零 finding。

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 零 finding

两轴均 0 finding 时写：「Round 1 零 finding，未进处置表。」不必建表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id       | severity                 | status | rationale | fix_ref   |
| ---------------- | ------------------------ | ------ | --------- | --------- |
| {tid}\_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep {tid}` 查，不在此记。

### 验收标准勾选

- [x] 两占位按钮 disabled 且显示「暂未开放」。
- [x] token-stats spec 声明独立持久化。
- [x] 外部链接带 noopener/noreferrer。
- [x] 托盘分隔符由字段控制，数量不变。
- [x] refresh_providers 不再先使用后声明。
- [x] 布尔记录浅比较替换，测试通过。
- [x] `pnpm test` 通过。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无
- 或：`{finding_id}`：原因；后续计划

### 结果摘要

- 完成 review_20260726_054747 采纳项 15/16/25/26/28/29/30：设置页占位按钮置灰、外部链接 noopener、托盘分隔符字段化、PopupView 声明顺序与布尔记录比较修复、token-stats 独立持久化文档化。

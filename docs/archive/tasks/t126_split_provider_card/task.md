---
tid: t126
slug: split_provider_card
diff_anchor: "91992f535668d2544bb5db17242ef9a6bf7534c0"
branch: "t126_split_provider_card"
---

# Task t126_split_provider_card

过程总账。reviewer **只写** `review_code.md` / `review_test.md`，不改本文件。

## 过程记录

只记有追溯价值的进展、踩坑、中途决策、偏离 plan、关键验证；不写命令流水账。

- 无事项时写：无

## Review 处置

**本文件本小节 = 处置表唯一落点。** 双审结束后在此追加轮次小节与表格；不要写到 `review_code.md` / `review_test.md`，也不要另建其他文件。

逐条对应两份 review 的 finding。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 解决不了；满轮后进 blocked，在「遗留」与口头报告中列出
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

### Round 1 (2026-07-26 17:54 UTC+8)

Round 1 零 finding，未进处置表。

### Round N (YYYY-MM-DD HH:MM UTC+8)

（有 finding 时用本表；每条 finding 一行。）

| finding_id     | severity                 | status | rationale | fix_ref   |
| -------------- | ------------------------ | ------ | --------- | --------- |
| t126_code_f001 | critical/important/minor | 已修   | {一句话}  | {文件:行} |

## 收尾报告

本 task 所在 commit 即 task commit，SHA 由 `git log --grep t126` 查，不在此记。

### 验收标准勾选

- [x] `ProviderCard.tsx` 行数 < 400（322 行）。
- [x] 拆分出的源码新文件行数亦在阈值内，命名合规（`provider_card_states.tsx` 118 行、`provider_card_content.tsx` 102 行）。
- [x] 测试拆分后各文件 < 600 行，共享 fixture 集中在 `provider_card_fixture.ts`，无重复定义。
- [x] 拆分前后 `it` 数量一致，无遗漏（32 个）。
- [x] typecheck 通过。
- [x] `pnpm test` 全绿（黑盒全量仅 `file-vault-backend` 并发写测试 flaky 超时，单独重跑通过；与本 task 无关）。
- [x] 行为零变化（仅结构性搬运，未改逻辑）。

### Reviewer verdict

- Round 1 code：PASS
- Round 1 test：PASS
- Round 2 code：N/A
- Round 2 test：N/A

### 遗留

- 无

### 结果摘要

- 源码：`ProviderCard.tsx` 拆出 `provider_card_states.tsx`（错误态/状态判定）与 `provider_card_content.tsx`（概览/账号明细渲染），主文件降至 322 行；对外 props 与 memo 行为保持不变。
- 测试：原单文件 32 个 `it` 按功能域拆为 7 个文件，共享 fixture 归集；定向测试 7 文件 32 测试全绿；typecheck 通过。

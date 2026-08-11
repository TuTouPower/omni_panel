---
tid: "t303"
slug: "fix_text_label_sm_classes"
title: "text-label-sm 失效类归级到九级字号档"
status: "done"
branch: "t303_fix_text_label_sm_classes"
worktree: ""
review_level: "single"
diff_anchor: "3996224c7a07602a6282c667d8de5e238b560fdc"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### 环境前置

- `node_modules/electron` 缺 dist/path.txt、`src/generated/` 不存在：同 t301 补齐（复制主仓 electron + mkdir generated + build）。

### 归级映射实施

- 11 处 `text-label-sm` 全部替换为 d032 显式 length 形式（裸 `text-body-sm`/`text-label-caps` 会命中 t302「全仓无裸类」扫描，故用 `text-[length:var(--text-*)]`；spec 归级映射为语义档，类名形式遵守 d032 机制）：
    - `Segmented.tsx:42` sm 尺寸 → `text-[length:var(--text-body-sm)]`
    - `TokenStatsView.tsx` deltaHtml 5 处（595 无数据/603 pp▲/607 pp▼/614 %▲/618 %▼，font-mono）→ `font-mono text-[length:var(--text-body-sm)]`
    - `TokenStatsView.tsx` 状态 3 处（657 updatedAgo/663 refreshing/671 error，font-mono）→ `font-mono text-[length:var(--text-label-caps)]`
    - `SessionTable.tsx:246` slug 次行 → `text-[length:var(--text-body-sm)]`
    - `SessionTable.tsx:252` 内嵌徽章 → `text-[length:var(--text-label-caps)]`
- deltaHtml 与状态两组 className 模式相同（`font-mono text-label-sm font-medium text-[var(--color-*)]`），靠上下文文本区分归级；增量指示（▲▼）归 body-sm，updatedAgo/refreshing/error 状态归 label-caps。

### 测试

- ui.test.tsx：新增「全仓无 text-label-sm 残留（t303 AC-001）」；t302「全仓自定义字号 token 无裸类残留」移除 text-label-sm 排除（归级后无需排除，扫描更严）。
- 单测：全量 2867 passed | 2 skipped（254 files）；受影响组件测试 41 passed。
- `pnpm designmd:check` drift passed（未增字号档，AC-002）。

### 黑盒

- `MOCK_FIXTURE=synthetic pnpm test:e2e:web`：74 passed，exit 0（字号类替换无渲染回归）。
- `pnpm test`：全量 2867 passed | 2 skipped。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-11 12:30 UTC+8)

| finding_id    | severity | status | rationale                                                                                   | fix_ref |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------------------- | ------- |
| t303_gen_f001 | minor    | 遗留   | AC-001 测试仅扫 ts 与 tsx，测试名「全仓」窄于 AC 措辞；当前 grep 全 src/ 0 命中，理论性风险 | p130    |

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 全仓 grep `text-label-sm` 0 命中（新增单测断言）；AC-002 `designmd:check` drift passed + `@theme` 字号档保持九级无新增；AC-003 11 处替换逐处核对归级映射一致（实施笔记映射表）；AC-004 全量 `pnpm test` 2867 passed | 2 skipped + 受影响组件测试 41 passed。

### Reviewer verdict

`single`：

- Round 1 general：PASS（1 minor：AC-001 测试仅扫 ts/tsx，遗留登记 p130）

### 结果摘要

11 处 `text-label-sm` 失效类归级到九级字号档（TokenStatsView 增量 body-sm/状态 label-caps、SessionTable slug body-sm/徽章 label-caps、Segmented sm body-sm），全部用 d032 显式 length 形式；未增字号档。遗留 p130 已登记。

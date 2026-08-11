---
tid: "t299"
slug: "lint_repo_template_js_tsconfig"
title: "lint 存量失败：repo_template JS 文件收编 tsconfig"
status: "done"
branch: "t299_lint_repo_template_js_tsconfig"
worktree: ""
review_level: "single"
diff_anchor: "0bb142023b7f0d34ca84c093bb07cc5b22747e96"
depends_on: ""
conflicts_with: ""
note: "p114：pnpm lint 全量 3 个 Parsing error（scripts/repo_template/repo_task/view_static/board.js、chain_plan.js、tests/repo_template/test_chain_plan_cases.js not found by project service），repo_template sync（5229b98e）引入未纳入 tsconfig"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

## 根因

repo_template sync 引入 3 个静态 CommonJS JS（`scripts/repo_template/repo_task/view_static/board.js` / `chain_plan.js`、`tests/repo_template/test_chain_plan_cases.js`），不在 tsconfig include，eslint type-checked 报「not found by the project service」，lint 门禁全量失败。

## 方案

3 个 JS 加入 eslint.config.ts `ignores`——静态工具/测试数据，不在 tsconfig 范围，排除比 allowDefaultProject 收编更干净（后者会触发 type-checked unsafe 报错）。其余 lint 配置不动。

## 验证记录

- RED：`pnpm lint` 3 个 Parsing error（复现 p114）。
- GREEN：`pnpm lint` 退出 0，零 warning。
- typecheck：`tsc --noEmit` 0 错误。

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-11 04:28 UTC+8)

| finding_id    | severity | status | rationale                                                                            | fix_ref          |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------------ | ---------------- |
| t299_gen_f001 | minor    | 已修   | eslint.config.ts 注释 chain_plan.js 误标「测试数据」，实为看板核心规划模块，区分三者 | eslint.config.ts |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001 `pnpm lint` 退出 0（零 Parsing error）；AC-002 `tsc --noEmit` 0 错误；AC-003 全量 `pnpm test` 2857 passed

### Reviewer verdict

`single`：

- Round 1 general：PASS（1 minor）
- Round 2 general：PASS（f001 已修）

### 结果摘要

repo_template 3 个静态 CommonJS JS（board.js 看板脚本 / chain_plan.js 规划模块 / test_chain_plan_cases.js 测试数据）加入 eslint.config.ts ignores，lint 门禁恢复全绿。全量测试 2857 passed + typecheck 绿。

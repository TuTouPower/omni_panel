---
tid: "t284"
slug: "session_typography_test_robustness"
title: "会话字号测试摆脱源文本正则依赖"
status: "done"
branch: "t284_session_typography_test_robustness"
worktree: ""
review_level: "single"
diff_anchor: "5e29bdae00f09862cfb9bd207531e056289c6f3b"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: "p102：t273 review f001 测试健壮性"
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending`「待办」节（普通模板）**，新条目先运行 `scripts/repo_template/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-10 23:00 UTC+8)

| finding_id    | severity | status | rationale                                                           | fix_ref                                                    |
| ------------- | -------- | ------ | ------------------------------------------------------------------- | ---------------------------------------------------------- |
| t284_gen_f001 | minor    | 已修   | 面板用例补精确断言 toBe(11)/toBe(13)，与 rail 用例对称              | tests/unit/renderer/styles/session_typography.test.tsx:115 |
| t284_gen_f002 | minor    | 已修   | font_px 语义表精简为被断言触达的两条目，数值与 globals.css 锚定一致 | tests/unit/renderer/styles/session_typography.test.tsx:63  |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：
    - AC-001：`session_typography.test.ts`（源文本正则）删除，`session_typography.test.tsx` 改渲染断言——仅剩 globals.css 读取用于字号 token 值断言（@theme 导出产物，designmd:check drift 守护，属「构建产物参与断言」）。
    - AC-002：原层级语义等价保留且更强——面板 title 11px < meta 13px（精确断言 + 层级）、rail title body-sm(12.5) > meta label-md(11.5)，均对真实渲染 DOM 元素断言（require_el 找不到即抛错）。
    - AC-003：`pnpm test` 全量 2833 passed、9 skipped（含改造后 3 用例）；typecheck / eslint 干净。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：PASS（2 minor：f001 面板精确断言、f002 font_px 表精简）
- Round 2 general：PASS（2/2 minor 处置复核成立，0 新 finding）

### 结果摘要

- 会话字号测试摆脱源文件文本正则，改渲染输出断言（元素级 + 字号精确值与层级），全量 2833 passed 无回归；纯测试改动。

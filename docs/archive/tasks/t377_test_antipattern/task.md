---
tid: "t377"
slug: "test_antipattern"
title: "测试假绿/反模式整改"
status: "done"
branch: "t377_test_antipattern"
worktree: ""
review_level: "single"
diff_anchor: "ca5891452cc6b4d9a155f1df9934a2d0dbb3b7fd"
depends_on: ""
conflicts_with: ""
note: "review_intensive: 复制实现/源码文本断言/弱断言/分支覆盖"
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
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-15 02:40 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t377_gen_f001  | minor    | 已修   | t2 去重用例未触达 last_scroll_to_id 守卫：改「scrollToId 变更定位 m2」正例，仓库 mutation 验证 t1/t2 挂 | tests/unit/renderer/components/workspace/VirtualMessageList.test.tsx:51-79 |
| t377_gen_f002  | minor    | 遗留   | codex 跨年用例只捕「两桶合并」类回归，月偏位/去零缺陷不触发；「可加 case」类非阻断 | p176 |
| t377_gen_f003  | minor    | 遗留   | 背景项(8) route_api/App 等无直接单测未处理：不在 spec「范围」、无 AC，按契约不阻断；另立 task 参考 | p177 |

### Round 2 (2026-08-15 02:50 UTC+8)

- 复核：f001 修复确认（仓库 mutation 注释 scrollToId 定位 → t1/t2 2 failed，恢复 3 passed）；f002/f003 维持非阻断。verdict PASS。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001（删内联复制 + 跨年分桶 + manifest 磁盘读）、AC-002（删文本断言）、AC-003（VirtualMessageList 组件测试）均列于 `handoff.json` 的 `ac_evidence`

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：N/A
- Round 1 test：N/A

`single`：

- Round 1 general：PASS（f001-f003 minor，其中 f001 修复、f002/f003 遗留→p176/p177）
- Round 2 general：PASS（f001 修复确认）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 删 3 处假绿/反模式测试源，补跨年/组件/表驱动覆盖；79 测试全绿，review 2 轮 PASS。

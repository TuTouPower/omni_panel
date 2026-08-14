---
tid: "t383"
slug: "trend_xaxis_labels_granularity"
title: "修复趋势图 X 轴：标签过度节流 + 1 天窗口丢时分粒度"
status: "done"
branch: "t383_trend_xaxis_labels_granularity"
worktree: ""
review_level: "full"
diff_anchor: "56b9b6d3d32361cdeacd222693bff54310455fe0"
depends_on: ""
conflicts_with: ""
note: "来源: p151"
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

### Round 1 (2026-08-15 04:35 UTC+8)

| finding_id     | severity | status | rationale | fix_ref |
| -------------- | -------- | ------ | --------- | ------- |
| t383_code_f001 | minor    | 已修   | width<122px 时 target_labels==1 除零 NaN：target_labels<=1 时 label_indices 空 | src/renderer/components/TrendSparkline.tsx:94-100 |
| t383_code_f002 | minor    | 已修   | format_utc_date 生产零引用：保留（trend.ts 格式函数导出合理），确认无破坏 | 无动作 |
| t383_test_f001 | minor    | 遗留   | /v1/trend 集成测试只断言 percent 未钉 date 时刻格式；第三消费方链路未显式覆盖，不阻断 | p180 |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001~005 均列于 `handoff.json` 的 `ac_evidence`（ISO 时刻保留 / 7 天全显示 / 节流 / 三路径一致 / 圆点保持），mutation 验证

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：PASS（f001 边界已修、f002 保留决策）
- Round 1 test：PASS（f001 /v1/trend 断言→p180）

`single`：

- Round 1 general：N/A

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 趋势图 X 轴时刻保留 + 宽度自适应节流；1359 测试全绿，code/test 双轴 PASS。

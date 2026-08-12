---
tid: "t317"
slug: "heatmap_zero_cell_outline"
title: "热力图 0 值格补可见轮廓"
status: "done"
branch: "t317_heatmap_zero_cell_outline"
worktree: ""
review_level: "single"
diff_anchor: "9830ab2d6e9087cc2c48a82daa8118cee85b48da"
depends_on: ""
conflicts_with: ""
schedule_status: "scheduled"
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/repo_template/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 根因核实：`Heatmap.tsx` itemStyle.borderColor 用 `pal.sliceBorder`，运行时与 Card 背景同解析自 `--color-surface-card`（light `#ffffff`、dark `#1f232c`），0 值格透明露出背景时边框不可辨。
- 选型：ChartPalette 新增 `heatCellBorder`，运行时解析自 `--color-outline`（light `#e6eaf1`、dark `#2a2f3a`，与 surface-card 均可辨，对比强于 `--color-hairline`）；fallback light `#c9ced6` / dark `#3a4150`，均与各自 surface-card fallback 可辨。`sliceBorder` 字段与 MetricDonut 消费不动。
- 实现：`echarts_token_resolver.ts` 接口 + FALLBACK light/dark + `resolve_chart_palette` 返回同步新增字段；`Heatmap.tsx` borderColor 改用 `pal.heatCellBorder`。DEFAULT_CHART_PALETTES 与 FALLBACK_PALETTES 同一对象（:421 别名），一处改动两处生效。
- 验证：先加失败测试（两主题断言 borderColor ≠ sliceBorder，红：`expected '#1f232c' not to be '#1f232c'`），实现后 heatmap_option + palette 回归 8/8 绿；typecheck、lint 通过。palette.test.ts:103-104 全等断言因返回对象与 fallback 同步加字段仍绿。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending/todo/`**：用 `scripts/repo_template/pending.py new --slug <主题>` 建条目并填写，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 (2026-08-12 02:45 UTC+8)

| finding_id    | severity | status | rationale                                                                                                                                                                | fix_ref                                              |
| ------------- | -------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| t317_gen_f001 | minor    | 已修   | spec 测试策略第 3 条措辞同步：web 渲染验证由 option 单测两主题断言 + CSS token 实值复验覆盖，渲染级目视留人工抽查（synthetic fixture 无 token-stats 数据，不强制自动化） | docs/tasks/t317_heatmap_zero_cell_outline/spec.md:82 |

### Round 2 (2026-08-12 02:50 UTC+8)

Round 2 PASS（f001 处置复核合理，0 finding）。无处置项。

### Round N (YYYY-MM-DD HH:MM UTC+8)

有 finding 时用本表；每条 finding 一行。

| finding_id     | severity                 | status | rationale | fix_ref |
| -------------- | ------------------------ | ------ | --------- | ------- |
| t000_code_f001 | critical/important/minor | 已修   | 一句话    | 文件:行 |
| t000_test_f002 | minor                    | 遗留   | 一句话    | pNNN    |

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 证据：AC-001/002 由 heatmap_option.test.ts 两主题 borderColor ≠ sliceBorder 断言 + CSS token 实值复验覆盖；AC-003 由既有 8 档/0 值断言保留；AC-004 由 MetricDonut 零改动 + palette 回归覆盖。详见 `handoff.json` ac_evidence。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-work` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`single`：

- Round 1 general：PASS（f001 minor）
- Round 2 general：PASS（f001 处置复核合理，0 finding）

`full`：

- N/A（single 级）

遗留不在此列出——见 `docs/pending/todo/`，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 热力图 0 值格补可见轮廓完成：ChartPalette 增 heatCellBorder（运行时解析 --color-outline）、Heatmap itemStyle 改用之，sliceBorder/MetricDonut 不动；AC 四条全绿，review 2 轮全 PASS（1 minor 修）。存量 designmd 失败见 p142。

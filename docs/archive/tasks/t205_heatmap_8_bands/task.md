---
tid: "t205"
slug: "heatmap_8_bands"
title: "热力图改八档并取消 0 值最低档"
status: "done"
branch: "t205_heatmap_8_bands"
worktree: ""
review_level: "single"
diff_anchor: "9202d820c701421c6a7e8dd58667d28a93187b54"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

### Step 1 前置

- SPIKE s014（jsdom + vitest jsdom env + echarts 6.1.0 SVG renderer）验证：piecewise visualMap 下 0 值（无匹配 piece）默认 `fill="none"`（透明，透出网格背景 rect），`series.itemStyle.color` 与 `visualMap.outOfRange.color` 均不覆盖。去掉 0 值 piece 后 0 值格自动显示背景色，满足 AC1，无需显式兜底。结论写入 spec 上下文区，preflight --require-verified PASS。

### Step 2/3 红绿

- chart-data：`HeatData.quantiles` 从 `{q1,q2,q3}` 改为 `number[]`（7 个 octile 边界 p12.5..p87.5），`build_heat_data` 算 octiles 切 8 档（仅正值，0 不参与分档计算）。
- palette：`heat` 数组 5 → 8 色，dark/light 各 8 档紫色递进（浅→深，最低正值最浅 heat[0]、最高最深 heat[7]）。
- Heatmap：抽 `buildHeatmapOption(data, quantiles, metric, pal)` 纯函数导出（组件与测试共用），visualMap pieces 改 8 段（band 0 `gt:0,lte:q0`；中间 `gt:q[i-1],lte:q[i]`；末档 `gt:q6` 无上界），去掉原 `{min:0,max:0}` 0 值档——0 值不匹配任何 piece，s014 验证透明渲染。
- 测试：chart-data 加 2 条（8 octile 边界升序且在正值范围内、cell 值不被分档改变 AC5）；palette 加 1 条（两主题 heat 8 色相邻不重复）；新增 heatmap_option.test.ts 3 条（pieces=8、无 piece 覆盖 0、8 色顺序 + 边界跨度）。
- 全量单测 2175 passed / 1 skipped；typecheck、lint 干净。

### Step 4 黑盒

- 全量单测 `pnpm test` 通过（2175 passed / 1 skipped）；e2e electron 跑无回归。
- s014 用 ECharts SVG renderer 实证 0 值透明渲染，覆盖 AC1；AC2/AC4 肉眼可区分度 spec 标人工目检，[deploy]。
- exactOptionalPropertyTypes：quantiles 索引访问 `number | undefined`，pieces 构造用 `?? 0` 兜底满足类型。

无

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：Round 1 零 finding，未进处置表。

### Round 1 (2026-08-04 20:50 UTC+8)

零 finding（general PASS）。

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
- 证据：AC1（8 档 pieces 全 `gt:0`，0 值无 piece 覆盖，s014 SVG renderer 实证透明渲染）；AC3（octile 边界随窗口分布，chart-data 测试断言 7 边界升序在正值范围内）；AC5（cell 值不被分档改变，chart-data 测试断言）；AC2/AC4（palette 两主题 8 色相邻不重复，肉眼可区分度 spec 标人工目检 [deploy]）。全量单测 2175 passed / 1 skipped，e2e 35 passed / 4 skipped。

### Reviewer verdict

`single`：

- Round 1 general：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- 时段热力改 8 档正值（octile 分位），0 值不再单独着色、显示为背景色（透明）。

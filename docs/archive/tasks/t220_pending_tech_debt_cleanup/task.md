---
tid: "t220"
slug: "pending_tech_debt_cleanup"
title: "pending 技术债清理（死折叠箭头/auto_seed 断言/trend 注释）"
status: "done"
branch: "t220_pending_tech_debt_cleanup"
worktree: ""
review_level: "single"
diff_anchor: "34addabf4e3e27d16cf8598691a84c0ecc2e8684"
depends_on: ""
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

Step 1 前置：`{doctor_cmd}` 无（blueprint 声明无独立 doctor）。

执行期（2026-08-05）：

- p041 死折叠箭头：三组件仿 ProviderCard 先例传 `collapsible={handler !== undefined}`，无回调时 `collapsed` 固定 false（内容常显）+ 不渲染 chevron：
    - `UpcomingResetCard`：`collapsible={onToggleExpand !== undefined}` + `collapsed={onToggleExpand !== undefined ? !expanded : false}`
    - `ProviderAccountRow`：`collapsible={can_collapse}`（collapsed 已有同样条件）
    - `PopupView` token 面板：`collapsible={is_live}` + `collapsed={is_live ? token_panel_collapsed : false}`
    - 补两组件 unit 断言（无回调不渲染「展开/折叠」按钮、内容常显）；token 面板 `VITE_ENABLE_TOKEN_PANEL` 默认关，unit 不渲染，改动与二者同模式低风险。
- p042 auto_seed：删 `BUNDLED_PLUGIN_NAMES` 7 条过时常量，改运行时 `bundled_plugin_count()` 扫描 `connectors/*/manifest.json`（16 个）与 `discover_connector_definitions` 对齐；断言 `>=` 真实计数。
- p047 trend 注释：`ipc.ts` `TrendApi.get` docstring 与 `observation-store.ts` 接口 docstring 更新为 t208 语义（≤max_points 桶、不强制 null 填充），移除「长度=days、缺失填 null」过时表述。
- p047 `provider_account_row.test.tsx:426` `setTimeout(50)` 负向等待 → `waitFor` 配「调用次数不变」+ timeout 300（缓存漏命中重发时立即红，不固定等 50ms）。
- 验证：整批 `pnpm test` 连跑 3 次全绿（222 files / 2353 passed）；typecheck / lint 通过。

创建期核实（2026-08-05，只读仓库）：

- p041 三处现状：
    - `UpcomingResetCard.tsx:76` `onToggle={onToggleExpand ?? (() => undefined)}` → 无回调仍渲染 chevron（死箭头）。
    - `ProviderAccountRow.tsx:214-215` `onToggle={can_collapse ? onToggleCollapsed : () => undefined}` → can_collapse=false 仍出箭头。
    - PopupView.tsx:771 `onToggle={is_live ? () => {...} : () => undefined}` token 面板 → mirror 树死箭头。
    - 已修先例：`CollapsibleCard` 的 `collapsible` prop（t203），ProviderCard 已传 `collapsible={can_collapse}`。
- p042：`auto_seed.spec.ts:8-16` `BUNDLED_PLUGIN_NAMES` 7 条；`connectors/` 16 个 connector.ts。
- p047：`ipc.ts:293-294` `TrendApi.get` 注释「返回长度=days、缺失日期填 null」过时；`observation-store.ts:18-25` docstring 与 `:27-31` t208 补充段表述矛盾；`provider_account_row.test.tsx:426` `setTimeout(50)` 负向等待。

补充（review f001 处置，2026-08-05）：`pnpm build` + `npx playwright test --project=electron tests/e2e/electron/auto_seed.spec.ts` 实跑 2/2 通过（fresh config 16 cards + existing config 16 acc-rows），AC2「测试仍过」e2e 闭环完成。

## Review 处置

本小节 = 处置表唯一落点。review 结束后在此追加轮次小节与表格；不写进 `review_code.md` / `review_test.md` / `review_general.md`，也不另建文件。

逐条对应当前 `review_level` 的 review finding（`full`：code/test；`single`：general）。`status` 只许：`已修` / `遗留` / `撤回`（全处理，不静默丢 finding）。

- `已修`：本 task 内已按 finding 改完
- `遗留`：本 task 不处理。**内容登记到 `docs/pending.md`「待办」节（普通模板）**，新条目先运行 `scripts/pending.py next` 取编号，`fix_ref` 填该 `pNNN`（已有 follow-up task 则填 tid）；本表只留引用与一句话 rationale。critical / important 遗留仍阻断，minor 遗留不阻断。
- `撤回`：误报；须原 reviewer 在对应 `review_*.md` 末尾追加撤回记录后，再在本表标 `撤回`

本 task 目录会随 `finish` 归档，遗留正文留在这里等于丢失——`fix_ref` 为空的 `遗留` 行不算处置完成。

reviewer 标注为 spec 过时的 finding（实现合理但与 spec 描述不符），处置为改 spec 上下文区，不计 FAIL。

### Round 1 场景说明

- **无 finding**：写「Round 1 零 finding，未进处置表。」
- **仅有 minor（无 critical / important）**：仍建表，逐条处置 minor。
- **有 critical / important**：建表，逐条填 status（不得留空）。

### Round 1 (2026-08-05 23:50 UTC+8)

两条 minor。f001 通过实跑 e2e 闭环（AC2「测试仍过」证据）；f002 处置为 spec 风险节记录（修正方案与 p041 AC-1 冲突，方向安全），均不计 FAIL。

| finding_id    | severity | status | rationale                                                                                | fix_ref            |
| ------------- | -------- | ------ | ---------------------------------------------------------------------------------------- | ------------------ |
| t220_gen_f001 | minor    | 已修   | 实跑 `pnpm build` + playwright electron auto_seed e2e 2/2 通过，AC2 闭环                 | task.md 实施笔记   |
| t220_gen_f002 | minor    | 已修   | 镜像按展开态测量过供给（安全方向）；修正会复现镜像死按钮与 p041 冲突，记录到 spec 风险节 | spec.md:风险与回退 |

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
- 证据：
    - AC-1（无回调不渲染折叠箭头）：三组件 `collapsible={handler !== undefined}`；`upcoming_reset_card.test.tsx` + `provider_account_row.test.tsx` 新增断言 `queryByLabelText` 无「展开/折叠」按钮 + 内容常显；有回调卡片既有测试全绿。
    - AC-2（auto_seed 断言真实计数 + 测试仍过）：删 7 条过时常量，`bundled_plugin_count()` 扫描 `connectors/*/manifest.json`（16，与 `discover_connector_definitions` 对齐）；`pnpm build` + playwright electron e2e 实跑 2/2 通过。
    - AC-3（trend 注释与实际一致）：`TrendApi.get` + `observation-store.ts` docstring 更新为 t208 语义（≤max_points 桶、不强制 null 填充），与 `query_trend_series`/`build_trend_series` 实现逐条一致。
    - AC-4（无 setTimeout 负向等待）：`provider_account_row.test.tsx` `setTimeout(50)` → `waitFor` 配「调用次数不变」+ timeout 300，文件内无残留 setTimeout。
    - AC-5（全量回归绿）：整批 `pnpm test` 连跑 3 次全绿（222 files / 2353 passed）；typecheck / lint 通过。

### Reviewer verdict

- Round 1 general：PASS（2 minor 已处置：f001 e2e 实跑闭环、f002 spec 风险节记录）

### 结果摘要

p041+p042+p047 三条 pending 技术债清理完毕：死折叠箭头三组件消除、auto_seed 断言对齐真实连接器计数、trend 注释订正、setTimeout 负向等待改 waitFor；含 e2e 实跑闭环。

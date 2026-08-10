---
tid: "t272"
slug: "agent_window_design_migration"
title: "Agent 统计窗口迁移到统一设计规范（token-stats 体系退役）"
status: "done"
branch: "t272_agent_window_design_migration"
worktree: ""
review_level: "full"
diff_anchor: "755b0b01d272894a1b266c5896e71d3177df0699"
depends_on: "t271"
conflicts_with: ""
note: ""
---

# Task 过程总账

**front matter 是状态权威**，只经 `scripts/task.py` 修改；`docs/tasks_index.json` 由它派生。reviewer 只写 `review_code.md` / `review_test.md` / `review_general.md`，不改本文件。

## 实施笔记

执行期边做边写：实际步骤、踩坑、中途决策、偏离 spec、关键验证、blocked 原因与用户放行的新轮次上限。

创建期不预测实施步骤——那时尚未读代码，预测必然失准。只记有追溯价值的内容，不写命令流水账。无事项时写：无

- 将 Agent 统计窗口的 KPI、图表、筛选、表格、标题栏和徽章迁移到共享 `ui/*` 组件与语义 token，删除旧 `Segmented`、`palette.ts` 和 `token-stats.css`。
- 新增 ECharts token resolver 与 palette revision 通知链路；主题和 accent 入口变化会触发图表 option 重绘，未知 agent 使用当前 accent 回退。
- Round 1 code/test 审阅分别发现动态 accent 接线、sub-agent Badge、未知 agent fallback、主题入口测试和 heat palette 回归断言缺口，均已在当前 task 内修复。
- 修复后 focused Vitest、全量 `pnpm test`、typecheck、lint、build、deadcode、arch、专项 Prettier、`git diff --check` 均通过；Electron 与 Web 黑盒均使用无头模式验证。
- 完整 Electron 套件串行运行中观察到两个既有 usage popup 首窗口启动超时，隔离复跑通过，已登记到 `docs/pending.md`，不属于当前 diff 路径。

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

### Round 1 (2026-08-09 14:59 UTC+8)

| finding_id     | severity  | status | rationale                                                               | fix_ref                                                      |
| -------------- | --------- | ------ | ----------------------------------------------------------------------- | ------------------------------------------------------------ |
| t272_code_f001 | important | 已修   | DOM 语义强调色统一从动态 accent 派生，和 ECharts resolver 共用变量链。  | src/renderer/styles/globals.css:173-178,211-215              |
| t272_code_f002 | minor     | 已修   | sub-agent Badge 恢复有效颜色、浅背景、边框与间距。                      | src/renderer/components/token-stats/SessionTable.tsx:249-255 |
| t272_code_f003 | minor     | 已修   | 未知 agent 识别色回退当前 palette accent，并补充断言。                  | src/renderer/lib/echarts_token_resolver.ts:394-397           |
| t272_test_f001 | minor     | 已修   | 通过 apply_accent 与 onThemeChange 真实入口断言 palette revision 变化。 | tests/unit/renderer/lib/theme.test.ts:81-85,128-132          |
| t272_test_f002 | minor     | 已修   | fallback heat palette 增加 8 档相邻颜色不重复断言。                     | tests/unit/renderer/lib/token-stats/palette.test.ts:93-107   |

### Round 2 (2026-08-09 15:37 UTC+8)

Round 2 code/test 均为 PASS，未发现新 finding；Round 1 的 5 条 finding 均已修复，处置表无需新增行。

## 收尾报告

本 task 的 commit 用 `git log --grep <tid>` 查，不在此逐条记 SHA。

### 验收

- spec：[`spec.md`](spec.md)
- 结果：AC1–AC4 自动化验收通过；AC5 `[deploy]` 视觉人工验收未在本轮执行，不能以自动化结果替代。
- 证据：
    - AC1：focused renderer 单测 4 files、23 tests 通过；全量 `pnpm test` 为 252 files、2745 passed、2 skipped。
    - AC2/AC3：主题与 accent 真实入口的 palette revision 断言、resolver 实际颜色解析、`notify → setOption` 重绘单测通过；`pnpm typecheck`、`pnpm lint`、`pnpm build` 通过。
    - AC4：旧 token-stats 文件已删除；`--ts-*`、`ts-*` 类和旧 import 无残留；`pnpm deadcode`、`pnpm arch` 与 `git diff --check` 通过。
    - Desktop 黑盒：`E2E_HEADLESS=1 xvfb-run -a` 运行 Agent 窗口 controls/bounds，5 passed、3 skipped；跳过项为 headless 无法可靠验证窗口可见性、尺寸或最小化/最大化状态。
    - Web 黑盒：`E2E_HEADLESS=1 xvfb-run -a` 配 synthetic fixture 运行 panel navigation，4 passed。
    - AC5：未进行逐屏人工视觉对照。

### Reviewer verdict

取自对应 review 报告**最后一条** `verdict:`（`full`：`review_code.md` + `review_test.md`；`single`：`review_general.md`；多轮追加时以末轮为准）。按**实际发生**的轮次列出（上限见 `task-run` `max_review_round`）；未开的轮次不写或写 N/A。收尾前最新一轮必须全部 PASS，历史 FAIL 保留。

`full`：

- Round 1 code：FAIL
- Round 1 test：PASS
- Round 2 code：PASS
- Round 2 test：PASS

遗留不在此列出——见 `docs/pending.md`「待办」，本文件处置表的 `fix_ref` 指向对应 `pNNN`。

### 结果摘要

- Agent 统计窗口已迁移到统一设计系统，自动化与无头 Web/Desktop 黑盒通过；视觉人工验收仍待执行。

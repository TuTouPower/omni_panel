# Task review t318（reviewer_focus: 通用）

- task：`t318_session_toolbar_rail_alignment`
- spec：`docs/tasks/t318_session_toolbar_rail_alignment/spec.md`
- diff_anchor：`855a1fd2770e23943cd45dbca8e5d500111c9d9c`
- target：`git diff 855a1fd2770e23943cd45dbca8e5d500111c9d9c`
- round：1
- reviewed_at：2026-08-12 01:52 UTC+8

## Findings

### t318_gen_f001 - 单测把 toggle 高度锚定在 Button sm 尺寸的巧合值上

- 严重度：minor
- 锚点：行为缺陷 + 测试脆性（AC-003 几何约束的像素前提隐式耦合）
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:282`（`h-[45px]`）、`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:918`（`expect(toggle?.className).toContain("h-[45px]")`）
- 问题：`h-[45px]` 恰好等于 `py-1.5`（12px）+ Button `size="sm"` 的 `h-8`（32px）+ `border-b`（1px）。单测注释（`h-[45px] = py-1.5 + h-8 + border`）与断言锚定的是当前 Button 尺寸下的巧合值：若未来 Button `sm` 高度调整（如 `Button.tsx:31` 改 `h-9`），该单测会无上下文地失败（测试名声称"与工具栏同高"，实际断言的是像素巧合），且新实现者需自行推导等式。当前 AC-003 的"高度差 ≤1px"由 topbar `items-stretch` 与 e2e 几何断言（`session_panel.spec.ts:287-289`，实跑通过）真正保证，单测的 `h-[45px]` 断言只是实现细节快照，不承载可观察行为。
- 建议：单测改为断言"toggle 与 toolbar 处于同一 flex 行且均无独立高度差异来源"（如 topbar 容器 `items-stretch`、toggle 无 margin），把具体像素值留给 e2e 几何断言；或保留现状并在注释中明确该值与 Button sm 尺寸联动、变更 Button 高度时须同步。

## 结论

### AC 复验方式

- AC-001（actions 占满 + 控制组右对齐）：`re_verified`。代码 `WorkspaceToolbar.tsx:46-47`（header `min-w-0 flex-1`、actions `flex-1 justify-end`）；单测 class 断言（`WorkspaceToolbar.test.tsx:32-34`）与 e2e 几何断言 `|toolbar.right - 12 - actions.right| ≤ 1`（`session_panel.spec.ts:283`）均实跑通过（vitest 4 文件 43 测试全绿；playwright web project `--grep t318` 1 passed）。
- AC-002（纵向留白对称紧凑、toolbar 底边与 body 顶边相接）：`re_verified`。`py-1.5` 对称收紧（`WorkspaceToolbar.tsx:46`）；单测（`WorkspaceToolbar.test.tsx:40-41`）与 e2e `|body.top - toolbar.bottom| ≤ 1`（`session_panel.spec.ts:285`）实跑通过。
- AC-003（toggle 与 toolbar 顶底对齐高度差 ≤1px；grid 与 rail 内容同基线）：`re_verified`。toggle 迁入 `session-workspace-topbar` 行（`items-stretch`，`WorkspaceView.tsx:278-304`），rail 只余内容区，grid/rail-scroll/body 顶边同线；e2e 4 项几何断言（`session_panel.spec.ts:286-292`）实跑通过。
- AC-004（按钮行为/顺序/布局切换不变）：`re_verified`。按钮顺序未变；`rail_collapsed` 状态与 `set_rail_collapsed` 保留，toggle 仅迁移位置；既有行为测试（rail 可折叠/展开 `WorkspaceView.test.tsx:523-529`、最近会话/清空/视图菜单/排布切换等）随本批 34 个 WorkspaceView 测试实跑全绿；SessionRail 接口移除 `on_toggle_collapse` 全仓无残留引用（grep 仅 task.md 记录）。

coverage = 4 / 4

- 前轮 finding 复核：无（round 1）
- 本轮新发现：1 条（t318_gen_f001，minor）
- 未进表的提示：
    - `tests/unit/main/scripts/designmd.test.ts` "真实 globals.css 导出区与 DESIGN.md 一致（AC5 drift 门禁）" 实跑失败（`check_drift() !== true`）。与 t318 无关：本 diff 文件清单不含 `DESIGN.md` / `globals.css`（git diff 已核实），属存量红灯，implementer 自述"存量失败属预期"经独立验证成立。建议另立 follow-up 修复。
    - 范围外观察：视图菜单 `left-0` → `right-0`（`WorkspaceToolbar.tsx:86`）是实现 AC-001（按钮靠右）后防右缘溢出的必要连带改动，e2e 已加边界断言防护，处置合理。
    - e2e 对"最近会话/清空"按钮顺序无显式断言，由既有单测覆盖行为，属可加 case 类，不计 finding。
- 总体判断：AC-001~004 实现与测试均满足契约区要求，实测全绿；仅 1 条 minor 测试可维护性观察，无未解决 blocking。
- 系统性 follow-up：建议 task「designmd drift 门禁红灯修复」（slug：designmd_drift_fix，非阻断；t318 范围外存量红灯）。

reviewed_scope: 74aa7f71ba67f30b
verdict: PASS

## Round 2 (2026-08-12 02:05 UTC+8)

### 前轮 finding 复核

- **t318_gen_f001（minor）已消除**：以 diff 为准核实——`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx` AC3 用例已删除 `expect(toggle?.className).toContain("h-[45px]")` 像素巧合断言（:917-926 现为结构性断言：topbar `items-stretch`、`not.toContain("h-[34px]")` 反断言、`topbar.contains(toggle/toolbar)` 同行放置、`rail` 不含 toggle）。mtime 证实 Round 1 报告（01:53:11）后仅该测试文件与 task.md 变更（测试 01:53:45），实现文件（WorkspaceView/WorkspaceToolbar/SessionRail 01:37-01:38、e2e 01:43）未再改动，处置表 fix_ref 与 diff 一致。实跑独立验证：WorkspaceView 34/34、WorkspaceToolbar+SessionRail+session_typography 9/9、eslint（改动文件 --max-warnings=0）通过、t318 web e2e 1 passed——与 implementer 自述一致，非采信自述。

### 本轮新发现

- 0 条。

### AC 复验方式（本轮改动涉及项）

- AC-003（toggle 与工具栏顶底对齐高度差 ≤1px；grid 与 rail 内容同基线）：`re_verified`。修复后单测改断结构（items-stretch + 同行放置），像素约束由 e2e 4 项几何断言承担——本轮实跑 `MOCK_FIXTURE=synthetic playwright --project=web --grep t318` 1 passed（toggle.top/bottom/height vs toolbar 差 ≤1px、grid.top≈rail_scroll.top），证据充分。
- AC-001/AC-002/AC-004：本轮无代码改动，沿用 Round 1 `re_verified` 结论（本轮全量单测与 lint 实跑仍绿）。

coverage = 4 / 4

- 前轮 finding 复核：f001 已消除（1/1）
- 本轮新发现：0 条
- 未进表的提示：
    - 可选健壮性优化（非 finding）：生产代码 toggle 仍显式 `h-[45px]`（`WorkspaceView.tsx:282`），在 topbar `items-stretch` 行内该显式高度冗余——删掉后 items-stretch 才真正结构性保证同高；保留则同高仍系于 45px 与 Button sm 的巧合值，但该像素约束现已由 e2e AC-003 几何断言兜底（Button 尺寸变更时 e2e 正确变红），单测不再产生假绿灯，f001 的测试脆性问题已解决，是否删 `h-[45px]` 属实现自由。
    - Round 1 建议的 designmd drift follow-up 经 `task.py list` + pending 去重：已存在 `docs/pending/todo/p142_designmd_drift_test_fail.md`（来源 t305 遗留，未开），无需新建 task。
- 总体判断：f001 修复完整落实 Round 1 建议方向（单测断结构、像素交 e2e），实跑全绿，无新问题；无未解决 blocking。
- 系统性 follow-up：无（designmd drift 已有 p142 条目）。

reviewed_scope: 18c64c8a344e3915
verdict: PASS

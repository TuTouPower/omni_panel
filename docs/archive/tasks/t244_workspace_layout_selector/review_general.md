# Task review t244（reviewer_focus: 通用）

- task：`t244_workspace_layout_selector`
- spec：`docs/tasks/t244_workspace_layout_selector/spec.md`
- diff_anchor：`8d00bded6012ff969ead079bbd43e9a757c28380`
- target：`git diff 8d00bded6012ff969ead079bbd43e9a757c28380`
- round：Round 1
- reviewed_at：2026-08-07 15:31 UTC+8

## Findings

### t244_gen_f001 - 部分会话数下菜单没有当前排布的选中态

- 严重度：important
- 锚点：违反 AC4；当前生效的排布在菜单中必须有选中态标识。
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:31`、`src/renderer/lib/workspace/slots.ts:133-142`、`src/renderer/components/workspace/WorkspaceToolbar.tsx:93-99`
- 问题：工作台初始 `layout` 固定为 `3`，且用户仍可通过保留的数字按钮把布局切到任意 `LAYOUT_OPTIONS`。但 `layout_choices_for_count` 对 1/2 个会话只返回列数 `[1]`/`[2, 1]`，对 7/8 个会话只返回 `[4, 2]`，均不包含列数 `3`。因此在装入 1、2、7 或 8 个会话后直接打开「视图」菜单（或在 8 个会话时保持默认布局），所有排布按钮的 `aria-pressed={layout === choice.columns}` 都是 `false`；当前实际网格仍按 3 列（受宽度降档规则约束）渲染，但菜单没有任何选中项。现有组件测试只覆盖 6 个会话，未覆盖这些状态。
- 建议：让会话数变化和布局入口共同维护一个始终可被菜单表示的当前布局（例如在候选集合不包含当前列数时切换到合理候选，并覆盖通过数字按钮/会话增删导致的状态变化），或调整候选生成/菜单渲染使当前有效列数始终出现在选项中；同时补充 1/2/8 等边界状态的组件级选中态回归测试。

## 结论

- 前轮 finding 复核：本轮为 Round 1，无前轮 finding。
- 本轮新发现：1 条。
- 未进表的提示：无。
- 总体判断：排布选项生成及 6 个会话的切换路径可用，但 1/2/7/8 个会话时当前布局可能不在菜单候选中，AC4 未满足。
- 系统性 follow-up：无。

verdict: FAIL

## Round 2 (2026-08-07 15:39 UTC+8)

## Findings

### t244_gen_f002 - 现有数字布局按钮在多数会话数下失去原有切换语义

- 严重度：important
- 锚点：行为缺陷；本轮新增的候选约束不应改变尚未移除的工具条数字布局按钮行为。
- 位置：`src/renderer/components/workspace/WorkspaceView.tsx:261-267`、`src/renderer/components/workspace/WorkspaceToolbar.tsx:114-123`、`src/renderer/lib/workspace/slots.ts:140-142`
- 问题：数字按钮仍渲染全部 `LAYOUT_OPTIONS`（1/2/3/4/6/8），但点击统一进入 `apply_layout`；当当前会话数为 6 时，候选只有 3/2，点击「布局 6」会被静默改成 3 列，当会话数为 8 时点击「布局 6」或「布局 8」也会被静默改成 4 列。基线实现是直接 `set_layout`，因此在视图菜单替代入口尚未移除数字按钮的阶段，用户仍可见的既有控制已经不能选择其标注的列数，且该行为会与按钮文本和网格结果不一致。
- 建议：不要让视图菜单的会话数候选校验拦截仍保留的数字按钮；分别维护菜单候选与旧数字按钮入口，并让菜单对数字按钮可设置的当前布局提供对应选中态，或在后续移除数字按钮前明确禁用而非静默改写。

## 结论

- 前轮 finding 复核：`t244_gen_f001` 已完整修复。会话数变化时 `WorkspaceView` 通过 `layout_choices_for_count` 将当前布局归一到候选；对 1/2/7/8 等前轮边界，菜单候选现在能包含当前布局并产生选中态。新增组件测试覆盖 8 会话选中 4×2，纯函数测试覆盖边界。
- 本轮新发现：1 条（`t244_gen_f002`）。
- 未进表的提示：无。
- 总体判断：排布菜单及前轮 AC4 blocker 已修复，但保留的数字布局按钮在多数会话数下会静默选择另一列数，仍存在重要级可观测回归。
- 验证：目标 renderer 测试与 workspace 纯函数测试 51/51 通过；`pnpm test`、`pnpm typecheck`、`pnpm lint`、相关文件 Prettier 检查及 `git diff --check` 均通过。
- 系统性 follow-up：无。

verdict: FAIL

## Round 3 (2026-08-07 15:45 UTC+8)

## Findings

无新 finding。

## 结论

- 前轮 finding 复核：
    - `t244_gen_f001` 已修复。`WorkspaceView` 在会话数量变化时用 `layout_choices_for_count` 将当前布局归一到可表示的候选列数（`src/renderer/components/workspace/WorkspaceView.tsx:251-259`）；`WorkspaceToolbar` 在归一化生效前也会把当前布局补入菜单候选，确保 `aria-pressed` 至少有一个选中项（`src/renderer/components/workspace/WorkspaceToolbar.tsx:30-40,103-110`）。6 会话的菜单选中态与切换、8 会话的 4 列×2 行选中态均有组件回归测试（`tests/unit/renderer/components/workspace/WorkspaceView.test.tsx:659-702`）。
    - `t244_gen_f002` 已修复。工具条中间的既有数字按钮仍直接调用 `on_layout_change(n)`，没有再经过按会话数候选集合的静默归一化（`src/renderer/components/workspace/WorkspaceToolbar.tsx:124-136`）；当数字按钮选择的列数不在当前会话数候选中时，菜单会补入该当前布局并以选中态显示（`src/renderer/components/workspace/WorkspaceToolbar.tsx:31-40,103-110`），因此不会再把按钮标注的布局静默改写为另一列数。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：Round 1/2 的两个 important finding 均已在当前完整 diff 中消除；排布候选生成、菜单选中态、菜单切换及既有数字布局入口未发现新的 critical / important 行为缺陷。
- 验证：`pnpm exec vitest run tests/unit/renderer/components/workspace/WorkspaceView.test.tsx tests/unit/renderer/lib/workspace_slots.test.ts` 通过（2 files，51 tests）；`pnpm exec tsc --noEmit`、目标文件 ESLint（`--max-warnings=0`）、目标文件 Prettier 检查及 `git diff 8d00bded6012ff969ead079bbd43e9a757c28380 --check` 均通过。
- 系统性 follow-up：无。

verdict: PASS


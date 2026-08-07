# Task review t242（reviewer_focus: 通用）

- task：`t242_draggable_provider_tabs`
- spec：`docs/tasks/t242_draggable_provider_tabs/spec.md`
- diff_anchor：`780c544deb5fc13ff6ab33096a21186438c52143`
- target：`git diff 780c544deb5fc13ff6ab33096a21186438c52143`
- round：1
- reviewed_at：2026-08-07 08:07 UTC+8

## Findings

### t242_gen_f001 - 可拖拽区域为整个 tab 按钮，违反 AC4「仅拖拽图标本身触发排序」

- 严重度：important
- 锚点：AC4
- 位置：`src/renderer/components/ProviderNav.tsx:57-59`、`src/renderer/components/ProviderNav.tsx:74-77`
- 问题：`ProviderNav` 将 `draggable={draggable}` 与 `onDragStart` 绑定在 `<button class="tab">` 上，导致 tab 按钮任意区域（图标 + 文字标签）都可触发拖拽排序。AC4 明确要求「仅拖拽图标本身触发排序」，当前实现把文字标签也变成了拖拽手柄，点击/拖动标签时同样会发起 drag，增大了误拖拽概率。同文件测试 `tests/unit/renderer/components/provider_nav.test.tsx:29-42` 也验证了按钮级 `draggable="true"`，未对图标单独断言。
- 建议：把 `draggable` 与 `onDragStart/onDragEnter/onDragOver/onDragEnd` 移到图标 `<span class="tab-ic">` 上，按钮保留 `onClick` 用于切换 tab；必要时在图标 span 上阻止事件冒泡以避免按钮收到多余 drag 事件，或调整 CSS 让图标成为唯一 drag handle。

### t242_gen_f002 - `use_provider_tab_drag.ts` 顶部存在不必要的 eslint-disable 注释

- 严重度：minor
- 锚点：代码规范 / 可维护性
- 位置：`src/renderer/hooks/use_provider_tab_drag.ts:1`
- 问题：文件首行 `/* eslint-disable react-hooks/rules-of-hooks */` 不必要。该 hook 在函数顶层按顺序调用 `useState`/`useCallback`，无条件分支调用或循环调用，未违反 react-hooks/rules-of-hooks。该注释会屏蔽未来真实违规，且与同一目录下其他 hook 的风格不一致。
- 建议：移除该 `eslint-disable` 注释，确认 lint 无告警后保留干净文件头。

## 结论

- 前轮 finding 复核：Round 1，无需复核。
- 本轮新发现：2 条（1 条 important，1 条 minor）。
- 未进表的提示：
    - 实现复用现有 `providerOrder` 字段持久化 tab 顺序，与 spec 上下文区「风险与回退」中建议的 `providerTabOrder` 字段不同；由于当前代码并不存在独立的 `overviewCardOrder`，复用 `providerOrder` 在类型与持久化路径上自洽，未违反任何 AC，但 spec 上下文区的风险/回退描述已相对代码现状过时，建议在 finalization 时同步更新 spec 上下文区。
    - AC1「松开鼠标后 tab 顺序立即更新」在文字上可理解为 drop 模型，但当前实现采用与现有 overview 卡片拖拽一致的 live-reorder（在 `dragover` 越中点时立即回调 `onReorder`），测试也按 live-reorder 断言；鉴于与既有交互模式一致且无明显缺陷，本轮未据此出 blocking finding。
    - AC3 恢复路径、AC5 默认顺序回退由既有 `use_popup_derived` 与 `PopupView` 配置加载逻辑覆盖，对应单测已在 `use_popup_derived.test.ts` 中通过。
- 总体判断：存在 1 条未解决的 important finding（AC4 违反），其余 AC 基本实现且相关测试通过。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-07 08:19 UTC+8)

## Findings

（无新发现）

## 结论

- 前轮 finding 复核：
    - `t242_gen_f001`（important，AC4）：已消除。`draggable`/`onDragStart`/`onDragEnd` 已移到 `<span class="tab-ic">`（`src/renderer/components/ProviderNav.tsx:85-99`），`<button class="tab">` 不再声明 `draggable` 或 `onDragStart`/`onDragEnd`，仅保留 `onDragEnter`/`onDragOver` 作为放置目标；测试同步改为断言图标可拖拽、按钮不可拖拽（`tests/unit/renderer/components/provider_nav.test.tsx:24-44`）。
    - `t242_gen_f002`（minor）：撤回。经实际运行 `pnpm eslint` 验证，移除 `/* eslint-disable react-hooks/rules-of-hooks */` 后该文件因函数名 `use_provider_tab_drag` 使用 snake_case、不满足规则要求的 `use[A-Z]` Hook 命名模式而报 6 条 `react-hooks/rules-of-hooks` 错误；项目其它 snake_case hook（`use_dnd_handlers.ts`、`use_popup_derived.ts` 等）也采用同样的 disable 注释，故该注释是项目约定下的必要 suppress，Round 1 判为「不必要」系误报。
- 本轮新发现：0 条。
- 未进表的提示：无。
- 总体判断：前轮 blocking finding 已消除，f002 误报撤回；本轮未发现新的 critical / important / minor finding，相关单元测试全部通过。
- 系统性 follow-up：无

verdict: PASS

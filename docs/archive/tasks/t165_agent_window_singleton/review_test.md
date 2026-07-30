# Task review t165（reviewer_focus: 测试）

- task：`t165_agent_window_singleton`
- spec：`docs/tasks/t165_agent_window_singleton/spec.md`
- diff_anchor：`587f4477bfb5e3d406285d018aeb9b899a19cfca`
- target：`git diff 587f4477bfb5e3d406285d018aeb9b899a19cfca`
- round：1
- reviewed_at：2026-07-30 22:59 UTC+8

## Findings

### t165_test_f001 - AC #4「单测覆盖单例行为」未实现，且未抽离可测单元

- 严重度：important
- 位置：`src/main/index.ts:540-552`（`createOrFocusAgentWindow` 内联于 `app.whenReady().then(async () => {...})` 闭包）；`docs/tasks/t165_agent_window_singleton/spec.md:23`（AC #4）
- 问题：spec 验收标准第 4 条明确要求「单测/集成测覆盖单例行为（mock windowManager 计数 createWindow 调用次数）」。本 task diff 中 `tests/` 目录零改动（`git diff 587f447 -- tests/` 为空），未添加任何单测或集成测覆盖单例语义。AC #1-#3（连续触发只建一个、已打开则 focus、关闭后引用清空）均无测试证据，仅能靠黑盒 `pnpm test`（现有 184 文件 / 1888 用例不含 tokenStats.open 路径）兜底，不构成对新增单例逻辑的直接覆盖。
- 实现者给出的「抽离纯函数会过度工程化」理由不成立，与代码库既有模式相悖：
    - `src/main/core/settings-close-action.ts` 将 `decide_settings_close(quitting)` 抽成独立模块，`tests/unit/main/settings-close-action.test.ts` 直接断言其返回值（`"hide"` / `"proceed"`）。
    - `src/main/core/main-panel/main-panel-controller.ts` 将窗口生命周期 + `closed` 清理抽成 `create_main_panel_controller`，`tests/unit/main/main_panel_controller.test.ts` 用 `FakeWindow`（vi.fn 桩 show/hide/destroy/on/isDestroyed）注入依赖，直接测 show/hide/destroy 路径。
    - `src/main/window/window-manager.ts` 同样为可测性抽离，`tests/unit/main/window_manager.test.ts` 通过 `vi.doMock("electron", ...)` mock `BrowserWindow` 测 `setWindowOpenHandler` 注册。
    - 三处证明：抽离「窗口生命周期决策」是本仓库既定模式，非本项目为 t165 新增的工程负担。
- 单例逻辑可低成本抽离为纯函数：签名近似 `function decideAgentAction(state: { win: BrowserWindow | null }, factory: () => BrowserWindow): { created: boolean; win: BrowserWindow }`。随后以 `FakeWindow`（沿用 `main_panel_controller.test.ts` 的既有模式）即可覆盖三条 AC：首次调用 factory 被调用一次；已存在未销毁时 factory 零调用且 `show`/`focus` 被调用；触发 `closed` 监听后 state.win 清空，下次调用再次走 factory。这恰是 spec AC #4 括号内建议的「mock windowManager 计数 createWindow 调用次数」。
- 当前实现把单例逻辑全部封装在 `app.whenReady().then` 闭包内的闭包私有变量上，外部测试无法在不 import 整个 `index.ts`（会触发 `app.whenReady()` 副作用）的前提下接触 `createOrFocusAgentWindow`。这是结构性可测性缺陷，非「故意简化」。
- 危险模式扫描未命中（未删/弱化/跳过任何既有断言，也未伪造测试），但 AC #4 明文要求覆盖且实现未满足，按共享规则「AC 缺测试」归 important。
- 建议：将 `createOrFocusAgentWindow` 的决策部分抽到 `src/main/core/agent-window/` 或 `src/main/core/agent-window-action.ts`（参照 `settings-close-action.ts` 的粒度），返回结构化结果（`created`/`focused`/`win`），由 `index.ts` 闭包内调用并维护 `agentWin` 引用。随后新增 `tests/unit/main/agent_window_action.test.ts` 覆盖三条 AC。如本轮不抽离，至少在 `tests/e2e/electron/tray_menu_actions.spec.ts` 补一条通过 `tokenStats.open` IPC 触发两次并断言 `omni.app.windows()` 数量未增长的集成测——目前该 spec 完全未覆盖 tokenStats.open 路径。

## 结论

- 前轮 finding 复核：本轮为 Round 1。
- 本轮新发现：1 条（t165_test_f001）。
- 总体判断：diff 未引入回归（`pnpm test` 184 文件 / 1888 用例全绿），但 spec AC #4 明文要求单测覆盖单例行为，实际零测试改动，且实现者拒绝抽离可测单元的「过度工程化」理由与本项目 `settings-close-action` / `main-panel-controller` / `window-manager` 三处既有可测性抽离模式不一致。AC #4 未达成，finding t165_test_f001 成立。危险模式扫描未命中其他问题。

verdict: FAIL

## Round 2 (2026-07-30 23:20 UTC+8)

### 前轮 finding 复核

- **t165_test_f001（AC#4 单测缺失）→ 已修**。
    - 抽离 `src/main/core/main-panel/agent-window-controller.ts`（`create_agent_window_controller` + `AgentWindowLike`，74 行），签名与 round 1 建议一致：`open_or_focus` / `get_window` / `shutdown`，`create_window` 依赖注入。
    - 新增 `tests/unit/main/agent_window_controller.test.ts`（6 用例，`npx vitest run` 全绿）。
    - 模式与 round 1 引用的先例 `tests/unit/main/main_panel_controller.test.ts:14-66` 一致：同构 `FakeWindow`（`vi.fn` 桩 show/focus/destroy/on + 真实 `isDestroyed`/destroyed 翻转 + `on("closed")` 收集 handler），同构 `make_window()` 工厂。
    - AC#1（只建一个）：test#2 `created.toHaveLength(1)`。
    - AC#2（focus 已有非新建）：test#2 `show/focus times(2)` + `created.length===1`。
    - AC#3（关闭后引用清空 + 重建）：test#3 `emit_closed(first)` → `get_window()===null` → 再 open 后 `created.toHaveLength(2)` 且 `get_window()===created[1]`。
    - AC#4（mock 计数 createWindow）：test#1/#2/#3/#4 均以 `created.length` 断言 factory 调用次数，精确匹配 spec 括号内要求。

### 本轮新发现

0 条。

### 覆盖广度提示（不进 finding 表）

- test#4 验证「窗口已 destroyed 但 `closed` 未触发」时不复用（外部 destroy 路径），但之后未接 `shutdown()` 验证「controller 持有已 destroyed 窗口时 shutdown 幂等」。实现 `shutdown` 中 `if (win && !win.isDestroyed())` 守护正确，风险低，按共享规则归「覆盖可更广」minor，不阻断本轮。
- FakeWindow mock 充分：`isDestroyed` 真反映 destroyed；`on("closed", ...)` 真注册 handler（test#3 `emit_closed` 触发引用释放）；`destroy` fn 真翻转 destroyed（test#5 验证 destroy 调用 + `get_window()===null`）。mock 仅在 BrowserWindow 边界，未 mock 被测 controller。

### 危险模式扫描（round 2）

未命中。断言全精确（`toHaveBeenCalledTimes` / `toHaveLength` / `toBeNull` / `toBe`），无 `.skip` / `.only` / `@ts-ignore` / `eslint-disable` / 删断言 / 注释断言 / 恒真 / 弱化。

### 总体判断

f001 已修彻底（抽离 + 6 单测 + 三条 AC + AC#4 mock 计数全覆盖），本轮零新 finding，无危险模式。PASS。

verdict: PASS

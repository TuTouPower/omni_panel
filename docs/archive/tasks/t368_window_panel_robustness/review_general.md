# Task review t368（reviewer_focus: 通用）

- task：`t368_window_panel_robustness`
- spec：`docs/tasks/t368_window_panel_robustness/spec.md`
- diff_anchor：`37292d9d815a1dc00d3435155ffb1ec3a8a9e694`
- target：`git diff 37292d9d815a1dc00d3435155ffb1ec3a8a9e694`
- round：1
- reviewed_at：2026-08-14 13:30 UTC+8

## Findings

### t368_gen_f001 - AC-001 运行时未达成：浮窗创建路径仍把宽度抬到 472（关键抬升源未动）

- 严重度：important
- 锚点：AC-001
- 位置：`src/main/core/main-panel/main-panel-controller.ts:154`、`:156`；`src/main/window/window-manager.ts:41`
- 问题：diff 只改了 `save_floating_bounds` 的 clamp（`:101`，USAGE_MIN_WIDTH→MIN_FLOATING_WIDTH），但浮窗**创建/恢复路径**三处仍强制 `USAGE_MIN_WIDTH=472`，全部未动：
  1. `main-panel-controller.ts:154` `width: clamp(bounds.width, USAGE_MIN_WIDTH, restored_display.workArea.width)`——首次打开 restore 产出默认 460，立即被抬到 472；saved 400 经 `restore_floating_bounds`（320 下限保持 400）后同样被抬到 472。
  2. `main-panel-controller.ts:156` `setMinimumSize(USAGE_MIN_WIDTH, 240)`——浮窗最小宽 472，用户无法把窗口缩进 320-472。
  3. `window-manager.ts:41` `WINDOW_CONFIGS.usage.minWidth = USAGE_MIN_WIDTH`——BrowserWindow 层再兜一道 472。

  运行时可观察行为：首次浮窗仍以 472 打开（非默认 460），saved 320-472 宽度恢复后仍为 472。AC-001 两个子句（「首次默认 460 保留」「saved 320-472 不抬升」）在真实窗口下均不成立。且因窗口最小宽 472，`save_floating_bounds` 的 `MIN_FLOATING_WIDTH=320` 下限在真实使用中永远不会被 <472 的值触达——该改动实际是死代码，整条 AC-001 修复在运行时无效果。

  关键证据：review 来源 `docs/reviews/review_20260813_114911/review_intensive.md:42` 明确指出抬升源是 `create_panel_window` 的 `clamp(bounds.width, MIN_PANEL_WIDTH, ...)`（对应现 `:154`），修复建议是「统一最小宽度常量来源」。该处常量仍与 save 路径分裂（`:154/:156` 用 USAGE_MIN_WIDTH，`:101` 用 MIN_FLOATING_WIDTH），review 所指 bug 未修。`handoff.json` 的 AC-001 证据仅覆盖 save 路径测试，不覆盖真实创建宽度。
- 建议：浮窗分支创建时 `:154` clamp 与 `:156` setMinimumSize 改用 `MIN_FLOATING_WIDTH`（与 `floating-bounds.ts` 语义对齐），并把 `window-manager.ts:41` usage minWidth 按 floating/panel 语义分离；保留 popup 主面板 `USAGE_MIN_WIDTH`。改动后补真实创建宽度的断言（见 f002）。

### t368_gen_f002 - AC-001 测试未触达真实行为，缺「首次默认 460」用例

- 严重度：minor
- 锚点：AC-001（测试可信与覆盖）
- 位置：`tests/unit/main/main_panel_controller.test.ts:185-196`
- 问题：新增测试在 `open_or_focus()` 之后直接对 fake window 调 `windows[0].setBounds({ width: 400 })`。该 fake 的 `setBounds` 绕过了创建路径的 `:154` clamp（创建时宽度已被抬到 472）与 `setMinimumSize`（fake 无 min 约束），只验证 `save_floating_bounds` 单点行为，不反映真实窗口宽度，故 f001 的运行时抬升不被发现。spec 测试策略（`:77`）明确要求「宽度单测补**首次默认**与 320-472 区间」，只补了 320-472 save 路径，缺「首次打开默认宽度 460」用例。
- 建议：补断言「无 saved 时创建后窗口宽度 = 460（或 ≤472 且不被抬升）」与「saved 400 恢复后窗口宽度 = 400」；若 fake 需支持 min 约束，在 `make_window` 中按 `setMinimumSize` 施加 clamp 再断言。

### t368_gen_f003 - 范围项 5 前半「before-quit 清理并入 will-quit Promise.all」未实现

- 严重度：minor
- 锚点：范围项 5（非 AC）
- 位置：`src/main/index.ts:1290-1324`、`:1326-1349`
- 问题：范围项 5 分两半：「before-quit 清理并入 will-quit Promise.all」+「对称调用 tokenStatsManager.stop()」。diff 只加了后半（`:1296` tokenStatsManager.stop()，AC-003 达成）；前半未做——before-quit 仍 `void local_api?.stop()`（`:1293`）、`void close_all_proxy_agents()`（`:1317`）、`void runtimeStore.flushPendingCache()`（`:1318`）fire-and-forget，will-quit 的 Promise.all（`:1326-1349`）仅含 configStore/runtimeStore/logging，未收拢这三项异步清理。对应 review 来源 `review_intensive.md:225` 的 [Low][50] 条目。
- 建议：把 `local_api?.stop()`、`close_all_proxy_agents()`、`runtimeStore.flushPendingCache()` 并入 will-quit 的 Promise.all（或统一单一 quit 协调器），明确退出等待集。

## 结论

- 前轮 finding 复核：Round 1 无前轮
- 本轮新发现：3 条
- 未进表的提示：`save_floating_bounds` 改 `MIN_FLOATING_WIDTH` 对 popup 主面板宽度无影响（`:92` `mode !== "floating"` 早退，已验证）；suppress_tokens Set 配对正确（每次 setBounds 唯一 token + setImmediate 只删自己，save 检 `size>0`，无过早归零）；index.ts SETTINGS_OPEN 闭包无 TDZ（settle/fail 均异步调用，Node 已验证 `removeListener` 可解除 `once` 监听，`fail` 不会被误触发），fail 销毁预热窗口供下次重建符合范围项 3；history-window did-fail-load 复位 loading + 清 pending_locs 正确，测试真区分（修前 send_spy 不触发、修后触发）；AC-003 的 `tokenStatsManager.stop()` 幂等（manager.ts:270-282，guard child 非空），before-quit 调用成立。
- 总体判断：AC-002/AC-003 达成；AC-001 的用户可观察行为（首次浮窗不抬升、saved 320-472 不抬升）运行时均未达成，属未解决 important，需修复后回归。
- 系统性 follow-up：修复创建路径 clamp 后补 AC-001 的「首次默认 460」「saved 400 恢复 400」两条行为断言。

verdict: FAIL

---

# Round 2 复核（reviewer_focus: 通用）

- task：`t368_window_panel_robustness`
- spec：`docs/tasks/t368_window_panel_robustness/spec.md`
- diff_anchor：`37292d9d815a1dc00d3435155ffb1ec3a8a9e694`（不变）
- round：2
- reviewed_at：2026-08-14 13:38 UTC+8
- 验证：`vitest run tests/unit/main/main_panel_controller.test.ts tests/unit/main/core/main-panel/history-window-controller.test.ts` 37 passed（24 + 13）

## 前轮 finding 复核

### t368_gen_f001（important, AC-001）— 已修复

逐点核实：

1. 创建路径 clamp（`main-panel-controller.ts:159`）已改 `MIN_FLOATING_WIDTH`，`setMinimumSize(MIN_FLOATING_WIDTH, 240)`（`:154`）并调序到 `setBounds`（`:155`）之前。`window-manager.ts:41` usage `minWidth` 仍 472（未动），但 floating 分支先 setMinimumSize(320) 再 setBounds(460)/show，min 320 ≤ 460——无论 Electron setBounds 是否 clamp 到 min，首次 460 均不抬升。saved 400 经 `restore_floating_bounds`（320 下限）→ `:159` clamp → 400，不抬升。
2. 创建路径为单一漏斗 `create_panel_window` floating 分支（`ensure_window`、config change 重建均走此），改动全量生效；popup 分支（`:170` setMinimumSize(USAGE_MIN_WIDTH,160)）未动，主面板仍 472，未误改。
3. save 路径（`:101`）与创建路径语义一致；因窗口 min 已降至 320，save clamp 不再是死代码（320-472 区间真实可达）。
4. 回归守卫：`save_floating_bounds` 与 `:159` 若改回 `USAGE_MIN_WIDTH`，首次 460 会被抬 472，新测试断言 setBounds 实收 460 即失败——能抓住回归。

残留（非 blocking）：`window-manager.ts:41` 未按 floating/panel 拆分（Round 1 建议的可选路线），改用「先 setMinimumSize 再 setBounds」覆盖，等效成立；真实 Electron 首次 460 是否被抬依赖 setBounds 对 min 的 clamp 行为，单测只验证实参 460 与调用序（代码阅读），建议人工冒烟确认一次。

### t368_gen_f002（minor, AC-001 测试）— 已修复

新增「creates a floating shell at the default 460 width on first open」（`tests/unit/main/main_panel_controller.test.ts:165`）走真实创建路径（open_or_focus → ensure_window → create_panel_window），断言 `windows[0].setBounds` 实收 460（经 wrapper 透传）。旧代码下 `:159` clamp 出 472，断言即失败——真回归守卫，非绕过。320-472 区间用例（`:195` setBounds 400 → saved 400）覆盖 save 路径；spec 测试策略两项（首次默认 + 320-472 区间）齐备。

残留（非 blocking）：`fake.setMinimumSize` 仍为 no-op mock，测试未模拟 Electron min clamp，因此「先 setMinimumSize 再 setBounds」的调序本身（真实窗口不抬升的关键）无测试守卫，仅靠代码阅读 + 实参断言。可接受的单测边界。

### t368_gen_f003（minor, 范围项 5）— 仍存在 / 未修

`tokenStatsManager.stop()`（`index.ts:1296`）Round 1 已确认加过，非本轮新修复；f003 实际缺口「before-quit 清理并入 will-quit Promise.all」未动：before-quit 仍 `void local_api?.stop()`（`:1293`）、`void close_all_proxy_agents()`（`:1317`）、`void runtimeStore.flushPendingCache()`（`:1318`）fire-and-forget；will-quit Promise.all（`:1329-1339`）仍只 await configStore/runtimeStore/logging。implementer 自述「will-quit Promise.all 已有」未消除 f003 的等待集缺口（将 `local_api?.stop()`、`close_all_proxy_agents()` 并入 await 集或统一 quit 协调器）。留作 minor 待办。

## 本轮新发现

- 0 条。

## 未进表的提示

- `handoff.json` 的 AC-001 证据仍只覆盖 save 路径（320-472 save 用例），未引用新增首次 460 创建路径用例与 `create_panel_window` 的 clamp/setMinimumSize 改动；建议补齐 evidence 后收尾。
- 同上 f001 残留：真实 Electron 首次 460 与 min 调序效果建议人工冒烟确认一次。

## 结论

- 前轮 finding 复核：f001 已修复；f002 已修复；f003 仍存在（minor）
- 本轮新发现：0 条
- 未进表的提示：handoff AC-001 证据未更新；真实窗口首次 460 建议人工确认
- 总体判断：AC-001 运行时抬升已消除（创建/恢复/保存三路径统一 MIN_FLOATING_WIDTH，popup 472 未误改），AC-002/AC-003 保持达成；仅剩范围项 5 的 minor 等待集缺口，无未解决 important/critical。
- 系统性 follow-up：f003 等待集缺口可并入后续 quit 协调 task；无独立 tid

verdict: PASS

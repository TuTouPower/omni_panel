# Task review t194（reviewer_focus: 测试）

- task：`t194_popup_hide_not_destroy`
- spec：`docs/tasks/t194_popup_hide_not_destroy/spec.md`
- diff_anchor：`bb31938d443e98df45c996839fea004249494109`
- target：`git diff bb31938d443e98df45c996839fea004249494109`
- round：Round 1
- reviewed_at：2026-08-03 21:19 UTC+8

## Findings

### t194_test_f001 - use_now_tick 缺「可见→隐藏」transition 测试，AC3 降级触发路径未覆盖

- 严重度：minor
- 锚点：AC3（隐藏期间前台计时器降级）覆盖不完整
- 位置：`tests/unit/renderer/hooks/use_now_tick.test.ts:49-65`（"does not advance while the document is hidden"）
- 问题：两个新测试都让 hook 在**挂载前**就把 `visibilityState` 设为 `hidden`，测的是「`visible` 标志初始为 false 时 interval 不推进」。但生产路径是窗口先可见挂载（`visible=true`），用户隐藏 → BrowserWindow.hide() → `visibilitychange`(hidden) → handler 把 `visible` 置 false。若 handler 漏掉隐藏方向的 `visible = next` 状态更新，现有两个测试全部照常通过（"does not advance" 依赖的是挂载时初始值，"refreshes immediately" 只验证了 `next && !visible` 分支），而 AC3 的真实降级（隐藏后 interval 停止更新）实际失效且无测试报警。挂载即 hidden 是人工路径，生产不出现。
- 建议：补一个真实路径用例：mount 于可见 → 改 `visibilityState` 为 hidden 并 dispatch `visibilitychange` → `advanceTimersByTime(60_000)` → 断言 `result.current` 不变。

### t194_test_f002 - AC2 数据保留/不再全量 IPC 仅间接覆盖，「不重挂载根组件」测试策略项无对应测试

- 严重度：minor
- 锚点：AC2（已加载数据与组件级缓存仍在、不重发 connector:list/config:get）
- 位置：`tests/unit/main/main_panel_controller.test.ts:235-249`、`tests/e2e/electron/tray_interaction.spec.ts:94-112`
- 问题：AC2 现由「窗口不重建」机制间接覆盖（unit 断言 `create_window` 一次、e2e 断言窗口数恒 1），逻辑自洽，但没有断言用户可观察的留存效果：重开后面板已加载数据/组件状态仍显示（如 e2e 重开后未再断言 "OmniPanel" 内容仍可见），也没有拦截/计数 `connector:list`/`config:get` IPC。spec 测试策略声明「renderer 测试断言…不重挂载根组件」亦无对应用例。若未来渲染层出现「窗口复用但状态被清」的回归，现有测试不会报警。
- 建议：e2e "reopening" 用例在第二次 toggle 后追加断言面板内容仍可见（内容级证据）；如需更严格，可在 main 进程对启动期全量 IPC 计数，重开时不增。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：不适用
- 改测方向复核：无迁就实现的改测。
    - `main_panel_controller.test.ts` 删除旧「closes popup shell on hide」（断言 `close` 一次）并替换为断言 hide 语义的 3 个用例，属 spec 语义变更（AC1）驱动的合法替换，注释已说明删除理由。
    - `tray_interaction.spec.ts` 旧「tray click closes open popup」断言 `popupWindowCount(...).toBe(0)`，因 anchor 下 URL hash 实为 `#usage`（`getRendererUrl("usage")` → `...#usage`）恒返回 0，属恒真假覆盖；新断言 `{exists: true, visible: false}` + `page.isClosed() === false` 是 AC1 真实行为。非弱化。
    - `main_panel_window_modes.spec.ts` / `tray_interaction.spec.ts` 的 `#popup`→`#usage` 是修正失效 hash（`#popup` 从不出现），使既有断言变为真实断言。
    - `popup_collapse_persistence.spec.ts` 补写 config.json：已验证 `has_previous_user_data`（config-store.ts:25-60）把非空 `connectors` 目录视为既有用户数据，config.json 缺失且无 .bak 时 `config-store` 抛错拒启（config-store.ts:338-348），fixture 修复必要且正确；auto_seed（index.ts:149-164）启动时把已发现 connector 合并入 config.plugins，`plugins: []` 不影响 seeded 插件加载。
- 本轮新发现：2 条（均 minor）
- 未进表的提示：
    - `tray_interaction.spec.ts:25-28` `triggerTrayClick` 的 `.catch(() => undefined)` 吞错（预存在，非 t194 diff 新增）；新用例中若 click 失败，poll 断言仍会红，不会假绿，可不处理。
    - anchor 下 `main_panel_window_modes.spec.ts`「floating close button hides」断言 `{exists: true, visible: false}` 配 `#popup` 恒失败，属既有失效测试，本次 hash 修正顺带修复（范围外修复，非 t194 引入缺陷）。
    - `use_now_tick.test.ts` 卸载用例只断言 `clearInterval`，未断言 `removeEventListener("visibilitychange", ...)`；hook 已正确成对注册/移除，覆盖缺口小。
    - AC1-AC4 覆盖：AC1 有 unit（hide/toggle/reopen）+ e2e（tray hide/reuse）双覆盖；AC3 降级/恢复有 renderer 单测（见 f001 缺口）；AC4 由既有「switches shell immediately when config changes」覆盖模式切换 close 路径，托盘路径由 e2e 实跑；AC5 为 `[deploy]` 人工签收，符合可测试性声明。
    - spec 契约区 drift 仅 `[ ]`→`[x]` 完成标记翻转，AC 文本无变化，非需求变更。
- 总体判断：无 critical / important；2 条 minor 不阻断，测试改动整体可信（旧恒真 e2e 转为真实断言、fixture 修复正确、新用例断言均触碰生产行为）。
- 系统性 follow-up：无

verdict: PASS

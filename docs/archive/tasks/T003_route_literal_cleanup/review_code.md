# Task review T003

- task：`T003_route_literal_cleanup`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：文档+代码
- reviewed_at：2026-07-20 03:40 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## Findings

### T003_code_f001 - L121 route 字面量修正正确（正向确认）

- 严重度：info
- 位置：`src/main/core/main-panel/main-panel-controller.ts:121`
- 问题：无问题。L121 从 `get_renderer_url("popup")` 改为 `("usage")`。形参语义为 route（window-manager 拼为 `#${route}`），非 shell mode；main panel 加载 route 确为 usage（与 WINDOW_CONFIGS + VALID_ROUTES 一致）。`use_route` 旧兜底 popup->usage 使行为无差异，字面量收口符合 route 统一前提。
- 建议：无需修改。

### T003_code_f002 - L126/L181 "popup" 为 shell mode 保留正确（正向确认）

- 严重度：info
- 位置：`main-panel-controller.ts:126, 181`；类型源 `main-panel-types.ts:5` `MainPanelShellMode = "popup" | "floating"`
- 问题：无问题。L126/L181 引用 MainPanelShellMode，非 route 语义，spec 非范围已声明保留。正确。
- 建议：无需修改。

### T003_code_f003 - route_values.test.ts 五处断言与真相源一致（正向确认）

- 严重度：info
- 位置：`tests/unit/route_values.test.ts`
- 问题：无问题。五处断言逐一核对：preload (`|| "usage"` L335、`case "setting":` L341、`case "tray":` L360)、route_api (`route === "setting"` L8)、main-panel (`get_renderer_url("usage")` L121)、window-manager (四 route)、use-route (VALID_ROUTES) 均命中。实跑单测 5/5 绿、全量 1337/1337 绿。
- 建议：无需修改。

### T003_code_f004 - `not.toContain` 限定子串无误报风险

- 严重度：low
- 位置：`route_values.test.ts:15-16, 22, 28`
- 问题：四条 `not.toContain` 均为限定子串（`|| "popup"`、`case "settings":`、`route === "settings"`、`get_renderer_url("popup")`），不会与 API surface（`popup_methods`、`main_panel.get_mode()` 返回 `"popup"|"floating"`、`settings_methods`）碰撞。负向断言稳。
- 建议：plan 已声明脆性权衡（格式敏感），守住 route 改名扩散价值大于脆性，与 first_paint_theme 同风格，可接受。

### T003_code_f005 - spec 验收 checkbox 未勾选

- 严重度：suggestion
- 位置：`docs/tasks/T003_route_literal_cleanup/spec.md:21-23`
- 问题：验收三项 checkbox 仍 `[ ]`，均已达成的验收。
- 建议：finalization 时 task_report 勾选（spec 归档不改）。

### T003_code_f006 - log.md 为空占位

- 严重度：suggestion
- 位置：`docs/tasks/T003_route_literal_cleanup/log.md:7`
- 问题：log.md 保留模板占位，未记录验证结果。
- 建议：finalization 填记录。

## 结论

通过。L121 字面量修正正确，其余 `main-panel-controller.ts` 内 `"popup"`（L126/L181）为 MainPanelShellMode 保留正确。route_values.test.ts 五处静态断言与代码真相源逐一吻合，`not.toContain` 限定子串无 API surface 误报，单测 5/5 绿、全量 1337/1337 绿。task 文档无虚假陈述，仅 spec checkbox 未勾选、log.md 未填两项收尾级建议。

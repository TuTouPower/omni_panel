# Task review T003

- task：`T003_route_literal_cleanup`
- spec：`spec.md`（同目录，随归档移动仍有效）
- target：本 task 未提交改动（working tree）
- reviewer_focus：测试
- reviewed_at：2026-07-20 03:40 UTC+8

流程（两 agent 并行、续写规则、权限）见 AGENTS.md step 6。

## Findings

### T003_test_f001 — App.tsx route→view switch 未断言（关键 route 真相源遗漏）

- 严重度：medium
- 位置：`src/renderer/App.tsx:9-18`（未覆盖）；`tests/unit/route_values.test.ts`（缺第六处）
- 问题：spec 验收列"五处"均为 route 的**生产/校验方**（preload switch、route_api 判定、controller 调用、WINDOW_CONFIGS、VALID_ROUTES）。但 `App.tsx` 是 route 的**消费方**——`switch (route) { case "setting": ... case "tray": ... case "agent": ... default: <PopupView/> }`，把 route 映射到具体视图。若未来把 `setting` 改名为 `settings`，五处生产方同步更新，但 App.tsx 漏改，则所有"设置"路由静默 fall through 到 `default` 渲染 PopupView，行为肉眼不可见且现有静态断言全绿。这正是 reviewer_focus 点名的"App.tsx route->view switch 未断言"风险。
- 建议：补一条 `it("App.tsx maps route to views", ...)`：断言 `case "setting":`/`case "tray":`/`case "agent":` 三处 case label 与 route 值一致，并 `not.toContain('case "settings":')`/`not.toContain('case "popup":')`。这样 route 改名扩散才真正被两端（生产方+消费方）夹住。

### T003_test_f002 — main/index.ts 调用点 route 字面量未断言

- 严重度：low
- 位置：`src/main/index.ts:458,460,551,668,732`（未覆盖）
- 问题：`index.ts` 在调用处硬编码 route 字面量：`createWindowFor("setting")`/`getRendererUrl("setting")`（L458/460）、`createWindowFor("usage")`（L551）、`getRendererUrl("tray")`（L668）、`createWindowFor("agent")`（L732）。这些是 route 的**第二消费方**，spec 五处未含。若 `WINDOW_CONFIGS` 键名或 route 值改名而 index.ts 调用点漏改，`createWindowFor` 会抛 `Unknown window`（运行时崩）或 loadURL 拼错 hash（静默走错 route）。
- 建议：补 `it("main/index.ts calls window-manager with correct route literals", ...)`，对五处调用点做 `toContain('createWindowFor("setting")')` 等断言。若担心 index.ts 后续重构拆文件，可只断言当前五处并接受未来调整。

### T003_test_f003 — VALID_ROUTES / WINDOW_CONFIGS 断言只查"包含"不查"排他"

- 严重度：low
- 位置：`tests/unit/route_values.test.ts:31-45`（window-manager、use-route 两个 it）
- 问题：两个 it 用四条 `toContain('route: "X"')` / `toContain('"X"')` 检查四个 route 值存在，但不验证"**仅**这四个"。若有人往 `VALID_ROUTES` 加 `"popup"` 或 `"settings"`（如临时兼容旧 hash），或往 `WINDOW_CONFIGS` 加第五个 `route: "popup"` 条目，测试仍绿——而 route 统一前提恰是被破坏的情形。spec 验收措辞是"统一为 usage/setting/tray/agent"（隐含闭集语义）。
- 建议：window-manager it 补 `expect((src.match(/route: "/g) || []).length).toBe(4)`；use-route it 补 `expect(src).not.toContain('"popup"')` 和 `not.toContain('"settings"')`（use-route.ts 全文无 popup/settings 出现，零误报风险）。

### T003_test_f004 — `not.toContain` 限定子串设计无误报风险（正向确认）

- 严重度：info
- 位置：`tests/unit/route_values.test.ts:15-16, 22, 28`
- 问题：无问题。四条负向断言均用**限定子串**而非裸单词：`'|| "popup"'`（含操作符+引号）、`'case "settings":'`（含冒号）、`'route === "settings"'`（含等号）、`'get_renderer_url("popup")'`（含函数名）。核对当前源码：preload L130 注释 `Read-only config (popup, tray)`、L194 `popup_methods`、L205 `get_mode()` 返回 `"popup" | "floating"`、L370/402 注释 `popup/tray cannot save`——均不碰撞任何负向子串。未来合理新增 `popup_methods` 方法、`settings_methods` 字段也不会误红。设计稳。
- 建议：无需修改。plan 已声明脆性权衡，与 first_paint_theme.test.ts 同风格。

### T003_test_f005 — 测试命名与组织合理（正向确认）

- 严重度：info
- 位置：`tests/unit/route_values.test.ts:9-46`
- 问题：无问题。`describe` 名"route values unified usage/setting/tray/agent"直指验收；五个 `it` 一一对应五个源文件，标题含具体断言点（"fallback usage + case setting/tray"、"judges route === setting"、"loads usage route (not popup)"、"exposes four routes"、"VALID_ROUTES matches the four routes"）。`read_source` helper 与 first_paint_theme 同 pattern，`process.cwd()` 解析路径与 vitest.config root 一致。结构清晰、可读性好。
- 建议：无需修改。

## 结论

通过（含两条建议性硬化）。spec 三项验收逐条达成：L121 = `get_renderer_url("usage")`（git diff 确认）；route_values.test.ts 五处静态断言与代码真相源逐一吻合（preload L335/341/360、route_api L8、main-panel L121、window-manager 四 route、use-route VALID_ROUTES）；`not.toContain` 限定子串无误报风险，与 first_paint_theme 风格一致。实跑单测 5/5 绿（与 code 评审独立复核同结论）。

两条硬化建议值得纳入但不阻塞：(1) **T003_test_f001**——补 App.tsx route→view switch 断言。这是 reviewer_focus 点名的关键遗漏：route 改名扩散若只守生产方不守消费方，App.tsx 漏改会静默渲染错视图，五处生产方断言全绿也挡不住。建议本次或后续小 task 补上。(2) **T003_test_f003**——VALID_ROUTES/WINDOW_CONFIGS 补闭集断言（count 或 `not.toContain("popup"/"settings")`），把"统一"的隐含语义显式化。

T003_test_f002（main/index.ts 调用点）为 low，spec 五处未含 index.ts 可视为设计选择（调用点而非定义点），但若 route 改名计划扩散到 index.ts，建议同步补断言。

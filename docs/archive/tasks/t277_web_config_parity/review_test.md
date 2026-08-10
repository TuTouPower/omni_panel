# Task review t277（reviewer_focus: 测试）

- task：`t277_web_config_parity`
- spec：`docs/tasks/t277_web_config_parity/spec.md`
- diff_anchor：`afd34807dc3c35b5174cb0e8b56abcf9cb4195af`
- target：`git diff afd34807dc3c35b5174cb0e8b56abcf9cb4195af`
- round：1
- reviewed_at：2026-08-10 01:49 UTC+8

审阅范围：相对 anchor 的全部改动；其中 7 个测试文件被修改，无测试文件删除。已逐条扫描新增测试中的 `.skip`、`.only`、`eslint-disable`、`@ts-ignore`、恒真断言、条件跳过和注释断言，未发现新增命中。单测新增路径实际运行通过，但高层 AC 仍有以下阻断性缺口。

## Findings

### t277_test_f001 - 既有 bridge 测试被就地改成新实现预期

- 严重度：important
- 锚点：改测方向复核；违反“旧测试语义失效时新增测试，旧测试整体删除并说明理由，禁止就地改预期”的 TDD 规则
- 位置：`tests/unit/web/usageboard-web.test.ts:183-200`
- 问题：anchor 中的既有用例是 `config.createInstance returns stub instance id`，断言 stub 返回空 ID。当前 diff 直接把同一个 `it` 块改名并改为 mock HTTP 响应、非空 ID 和请求断言，同时在该块中继续加入 export 测试；没有新增独立用例，也没有整体删除旧用例并留下语义失效理由。这样无法从测试演进中区分“旧契约已废弃”与“测试迁就当前实现”，违反改测审查规则。
- 建议：将旧用例作为已废弃测试整体删除并在 task 处置记录说明原因，再新增独立的 `createInstance` 新语义用例；不要就地替换既有用例的预期。

### t277_test_f002 - AC1 没有 web 面板实例管理与持久化高层覆盖

- 严重度：important
- 锚点：AC1；行为缺陷：接口返回实例 ID 但未保存配置或页面未显示新实例时，现有测试仍通过
- 位置：`tests/e2e/web/settings_view.spec.ts:9-80`；`tests/integration/local-api/server.test.ts:302-327`；`tests/unit/web/usageboard-web.test.ts:183-219`
- 问题：web e2e 只覆盖导航、外观和导出勾选，没有 duplicate/createInstance 操作。bridge 单测仅 mock `fetch` 检查请求，local-api 集成测试只检查 200 和 `expect.any(String)`，没有断言 `configStore` 已持久化新插件，也没有断言 web 设置页出现新实例。因此 duplicate/createInstance 的真实调用链和 AC1 的“面板可见新实例、配置持久化”未被验证；例如 handler 返回随机 ID 但跳过 `save`，全部现有测试仍可 PASS。
- 建议：在 web e2e 中从设置页实际执行 duplicate 与 createInstance，断言新实例出现在账号列表；随后通过 mock local-api 的 GET `/v1/config` 或独立读取状态断言配置已持久化。保留现有单测作为端点/bridge 细节覆盖。

### t277_test_f003 - AC2 只测明文勾选控件，没有测 web 导出产物

- 严重度：important
- 锚点：AC2；行为缺陷：导出按钮忽略勾选值或下载错误文件时，现有 e2e 仍通过
- 位置：`tests/e2e/web/settings_view.spec.ts:66-80`；`tests/unit/web/usageboard-web.test.ts:221-241`
- 问题：web e2e 只检查 checkbox 初始未选、选中后警示文案出现，从未点击导出按钮，也未检查下载文件。bridge 单测用 mock response 只断言请求 URL 带 `includeSecrets=true`、创建/回收 blob URL，没有读取 Blob 内容、下载文件名或不含密钥的默认产物。因而没有测试“web 勾选后产物含密钥、未勾选不含密钥”的完整用户行为；`SettingsView` 未把 `include_secrets` 传给 `config.export` 或下载错误数据时测试不会失败。
- 建议：web e2e 实际点击导出，分别覆盖未勾选和勾选两种状态，拦截/读取下载产物并断言 secret 字段与警示文案；bridge 单测至少断言 Blob 内容和下载动作。

### t277_test_f004 - AC4 没有真实 `--cli export` 调用，也没有与 web 产物等价性断言

- 严重度：important
- 锚点：AC4；行为缺陷：CLI dispatch 未接通、默认/含密钥参数错误或输出与 web 导出不等价时，现有测试仍通过
- 位置：`tests/unit/main/cli/args.test.ts:133-156`；`tests/unit/main/cli/client.test.ts:234-279`；`tests/e2e/electron/cli_serve.spec.ts:374-392`
- 问题：args 单测只验证解析，client 单测直接调用 `run_export_command` 并连接一个返回任意 JSON 的 fake server；新增 CLI 闭环 e2e 反而直接 GET `/v1/config/export`，没有执行 `--cli export` 子命令。整个 diff 没有覆盖 Electron 入口 dispatch、真实瘦客户端 stdout，以及 CLI 输出与 web 勾选导出相等这三个 AC4 关键行为。当前 fake JSON 即使不含 secret，也无法证明真实端点结果与 web 下载结果等价。
- 建议：启动真实 `--cli serve`，以子进程执行 `--cli export` 和 `--cli export --include-secrets`，解析 stdout JSON；分别与 web 导出端点/下载产物做等价断言，并覆盖默认不含 secret 的成功路径。

### t277_test_f005 - AC5 缺少 schema 非法、可读错误和配置不变性断言

- 严重度：important
- 锚点：AC5；行为缺陷：schema 不符文件被接受、返回不可读错误或已部分改写现有配置时，现有测试仍通过
- 位置：`tests/integration/local-api/server.test.ts:348-378`；`tests/unit/ipc/config-ipc.test.ts:1302-1325`
- 问题：local-api 测试只覆盖一个合法配置和字符串 `{` 的 400 状态码，没有断言错误响应可读，也没有发送 schema 不符的合法 JSON（如缺少必需字段/错误字段类型），更没有在非法导入后重新读取并断言原配置保持不变。config-ipc 新增测试也只有成功导入路径；web e2e 没有选择文件执行 import。因而 AC5 要求的坏 JSON、schema 不符、错误可读和“不破坏现有配置”没有完整证据。
- 建议：先保存原配置快照，分别 POST 坏 JSON 和 schema-invalid JSON，断言 400、可读错误消息、配置快照不变；再用 web 文件选择器覆盖非法文件到设置页错误提示的完整链路。

### t277_test_f006 - AC6 的 SSE 测试绕过真实变更接线和双上下文行为

- 严重度：important
- 锚点：AC6；行为缺陷：`onConfigSaved`/主题回调未接入 SSE，或第二页面未订阅/未更新时，现有测试仍通过
- 位置：`tests/integration/local-api/server.test.ts:380-396`；`tests/unit/web/usageboard-web.test.ts:300-320`
- 问题：local-api 集成测试直接调用公开的 `api.publish_config_change` / `api.publish_theme_change`，绕过真实 config save 与 nativeTheme 变更；web 单测使用 fake `EventSource`，再手工调用保存下来的 handler。两者都没有真实例的两个页面/上下文，也没有从页面 A 修改配置或主题后观察页面 B。因此只证明了“手工发布的 frame 能被手工 handler 接收”，没有证明 spec 测试策略要求的真实 SSE 推送和跨视图实时更新。
- 建议：使用真实 local-api/应用实例建立两个 EventSource 或 Playwright 页面，从上下文 A 实际保存配置、切换主题，再在上下文 B 断言收到事件并更新可观察 UI；同时保留当前单测覆盖 malformed frame/relay 细节。

## 结论

- 前轮 finding 复核（Round N≥2 才写）：无（本轮为首轮）
- 改测方向复核：有。`t277_test_f001` 是既有 `createInstance` 用例就地改测；其余新增用例未发现断言删除、反转或注释化。
- 本轮新发现：6 条（6 important）
- 未进表的提示：
    - 危险模式扫描未发现新增 `.skip`、`.only`、恒真断言、条件跳过或静默错误；`expect.any(String)` 位于 AC1 缺口证据中，问题是覆盖不足而非另立语法 finding。
    - 运行 `pnpm exec vitest run tests/integration/local-api/server.test.ts tests/unit/ipc/config-ipc.test.ts tests/unit/main/cli/args.test.ts tests/unit/main/cli/client.test.ts tests/unit/web/usageboard-web.test.ts`：5 个文件、171 个测试全部通过。
    - CLI Playwright 闭环尝试未进入断言阶段：本地 Electron 启动因 `better-sqlite3` 原生模块 Node ABI 137 与 Electron 所需 146 不匹配而退出；web Playwright 用例因 `127.0.0.1:5174` 未监听而无法启动 fixture。两项属于验证环境前置问题，不作为本轮 finding，但不能据此宣称高层 e2e 已通过。
    - AC3/AC7 新增 round-trip 测试本身覆盖了合成密钥导出、目标 `config.json`/`secrets.vault`/stdout 脱敏和 mock connector Authorization；未另立 finding。
- 总体判断：AC1、AC2、AC4、AC5、AC6 均缺少能证明用户可观察闭环的测试，且存在一处就地改测；当前有未解决 important finding，FAIL。
- 系统性 follow-up：无；当前缺口均位于 t277 测试范围内。

verdict: FAIL

## Round 2 (2026-08-10 02:23 UTC+8)

### 前轮 finding 复核

- `t277_test_f001`：已消除。`tests/unit/web/usageboard-web.test.ts:183-219` 删除旧 stub 用例后新增独立的 `duplicate` 与 `createInstance` 用例；当前 diff 未再就地改写同一断言，也未发现迁就实现的改测。
- `t277_test_f002`：仍存在。`tests/integration/local-api/server.test.ts:305-335` 现在检查 mock `configStore` 驱动的内存配置包含新实例，但 `tests/e2e/web/settings_view.spec.ts:67-181` 仍没有从 web 面板执行 duplicate/createInstance，也没有断言页面显示新实例或重载后的持久化结果；AC1 高层闭环未覆盖。
- `t277_test_f003`：已消除。`tests/e2e/web/settings_view.spec.ts:83-127` 实际等待下载并读取未勾选/勾选产物，`tests/unit/web/usageboard-web.test.ts:221-258` 断言两种 Blob 内容及下载动作；警示文案和默认未勾选仍由 `:67-81` 覆盖。
- `t277_test_f004`：已消除。`tests/e2e/electron/cli_serve.spec.ts:428-443` 通过真实 Electron 子进程执行 `--cli export` 与 `--cli export --include-secrets`，解析 stdout 并分别与同一 LocalAPI 导出结果做深等价断言；真实 CLI E2E 8/8 通过。
- `t277_test_f005`：修不彻底，仍存在。`tests/integration/local-api/server.test.ts:357-404` 已补齐 API 层坏 JSON、schema-invalid、可读响应和配置不变性；但 `tests/e2e/web/settings_view.spec.ts:129-181` 只覆盖非法文件的失败状态，确认对话框回调未断言错误内容，按钮仅断言通用“失败”，且没有合法文件经 web 文件选择器成功导入并验证生效。AC5 的 web 用户闭环仍不完整。
- `t277_test_f006`：仍存在。`tests/integration/local-api/server.test.ts:448-473` 已从真实 `/v1/config` POST 驱动两个原始 SSE reader，但仍由测试手动把 `onConfigSaved` 接到 `api.publish_config_change`，没有两个 web 页面/bridge/renderer 上下文；`tests/unit/web/usageboard-web.test.ts:317-337` 仍是 fake `EventSource` 手工触发 handler，也没有真实主题事件后第二视图更新。AC6 的跨视图高层行为未被验证。

### 本轮 Findings

本轮无新增 finding；前轮未闭环项沿用原 finding ID。

### 结论

- 改测方向复核：无。本轮新增/调整测试未发现断言删除、反转、注释化、弱化或 `.skip` / `.only`；`expect.any(String)` 位于后续配置成员存在性断言之前，不作为独立覆盖证据。
- AC 覆盖：AC2、AC3、AC4、AC7 已有可观测闭环；AC1、AC5、AC6 仍缺 web 高层闭环。
- 危险模式扫描：未发现本轮新增恒真断言、条件跳过、静默错误或 mock 被测逻辑本身。
- 验证：`pnpm exec vitest run tests/integration/local-api/server.test.ts tests/unit/ipc/config-ipc.test.ts tests/unit/main/cli/args.test.ts tests/unit/main/cli/client.test.ts tests/unit/web/usageboard-web.test.ts tests/unit/renderer/lib/theme.test.ts` 中 5 个单测文件、139 个测试通过；集成文件因 `better-sqlite3` Node ABI 146 与当前 Node ABI 137 不匹配，在 setup 阶段失败，49 个测试未进入断言。`E2E=1 E2E_HEADLESS=1 xvfb-run -a pnpm exec playwright test --config=playwright.config.ts --project=electron tests/e2e/electron/cli_serve.spec.ts` 8/8 通过；同约束 web E2E 因 `127.0.0.1:5174` 未监听在 fixture 初始化阶段失败，未进入断言。`git diff --check` 通过。
- 总体判断：f002、f005、f006 仍是未解决 important finding，AC1/AC5/AC6 无法据测试证明闭环，FAIL。
- 系统性 follow-up：无；缺口仍在 t277 测试范围内。

verdict: FAIL

## Round 3 (2026-08-10 03:27 UTC+8)

### 前轮 finding 复核

- `t277_test_f001`：已消除。`tests/unit/web/usageboard-web.test.ts:183-258` 将旧 stub 用例整体移除，改为独立的 `duplicate` 与 `createInstance` 请求/返回断言；本轮未发现就地迁就实现的既有断言。
- `t277_test_f002`：已消除。`tests/e2e/web/settings_view.spec.ts:182-243` 通过真实 web 设置页点击 duplicate 与 createInstance，分别断言账号行数量/名称和 `GET /v1/config` 中插件数量/实例名；`tests/integration/local-api/server.test.ts:305-335` 另有真实 LocalAPI 路由与 config store 保存断言。`expect.any(String)` 不是唯一证据，后续成员存在性断言约束了返回 ID 的实际持久化结果。
- `t277_test_f003`：已消除。`tests/e2e/web/settings_view.spec.ts:83-127` 实际触发两次下载并读取文件内容，覆盖未勾选不含密钥与勾选含密钥；`tests/unit/web/usageboard-web.test.ts:221-258` 同时断言请求参数、Blob 内容、创建/回收下载 URL。
- `t277_test_f004`：已消除。`tests/e2e/electron/cli_serve.spec.ts:359-503` 通过真实 Electron 瘦客户端执行两种 export，解析 stdout 并与同一 LocalAPI 导出结果做深等价断言；本轮 CLI E2E 8/8 通过。
- `t277_test_f005`：已消除。`tests/e2e/web/settings_view.spec.ts:129-180` 通过真实文件选择器覆盖坏 JSON、schema-invalid JSON 的可读错误，以及合法文件导入后的 `GET /v1/config` 主题变化；`tests/integration/local-api/server.test.ts:357-404` 覆盖真实 API 的错误消息和非法导入后配置不变。
- `t277_test_f006`：仍存在，修复不彻底。`tests/e2e/web/settings_view.spec.ts:245-275` 虽建立两个真实 Playwright 页面并从页面 A 点击主题，但 web project 由 `tests/e2e/fixtures/vite_mock_plugin.mjs:25-31` 接入 `tests/e2e/fixtures/mock_server.mjs`；事件由测试 mock 的 `save_config` 在 `tests/e2e/fixtures/mock_server.mjs:165-169` 直接发布，未经过生产 `create_local_api_server` 与 main 侧事件接线。`tests/integration/local-api/server.test.ts:448-473` 只在真实 LocalAPI 上读取两个原始 SSE stream，`tests/unit/web/usageboard-web.test.ts:358-378` 只用 fake EventSource 验证 relay，三层之间没有一个真实 LocalAPI → web bridge → 两个 renderer 页面闭环。因此 AC6 的“真实例双上下文”测试策略仍未满足，页面 B 的 DOM 变更不足以证明生产 SSE 接线有效。

### 本轮新发现

本轮无新增 finding；`t277_test_f006` 沿用前轮编号，不重复登记。

### 结论

- 改测方向复核：无。逐项检查本轮新增/修改测试，未发现删除、反转、注释化或弱化既有断言，未发现 `.skip`、`.only`、恒真断言、条件跳过、静默错误或 mock 被测 web 逻辑本身。
- AC 覆盖：AC1、AC2、AC3、AC4、AC5、AC7 已有可观察测试闭环；AC6 仍缺生产 LocalAPI 与两个真实 web renderer 上下文的同链路证据。
- mock/断言可信性：AC1 与 AC5 的 mock 只替代 LocalAPI 边界，生产 web bundle、bridge、文件选择器和设置页交互均实际执行，且通过 HTTP 状态读取验证保存结果，不是假存在性断言；但 AC6 的双页面测试确实绕过了生产 LocalAPI 事件生产端，故沿用 `t277_test_f006`。
- 危险模式扫描：本轮 diff 涉及 9 个测试文件及 web mock fixture；未发现新增危险模式。`git diff --check afd34807dc3c35b5174cb0e8b56abcf9cb4195af -- tests` 通过。
- 验证：`pnpm exec vitest run tests/unit/ipc/config-ipc.test.ts tests/unit/main/cli/args.test.ts tests/unit/main/cli/client.test.ts tests/unit/renderer/lib/theme.test.ts tests/unit/web/usageboard-web.test.ts` 为 5 个文件、142 个测试通过；`pnpm exec vitest run tests/integration/local-api/server.test.ts` 为 49 个测试通过。`E2E=1 E2E_HEADLESS=1 xvfb-run -a node_modules/.bin/playwright test --config=playwright.config.ts --project=web tests/e2e/web/settings_view.spec.ts` 在无可见窗口、手动启动同样 headless preview 后 10/10 通过；同约束下 `tests/e2e/electron/cli_serve.spec.ts` 8/8 通过。首次通过 pnpm 管理 preview 的 web E2E 因 `127.0.0.1:5174` 未监听在 fixture 初始化失败，重启 headless preview 后复验通过，不作为 finding。
- 总体判断：`t277_test_f006` 仍是未解决 important finding；AC6 测试证据不满足批准的真实实例双上下文策略，FAIL。
- 系统性 follow-up：无；缺口仍在 t277 测试范围内。

verdict: FAIL

## Round 4 (2026-08-10 03:44 UTC+8)

审阅范围：相对 anchor 的全部当前改动，重点复核 Round 3 沿用的 `t277_test_f006` 对应的新增用例 `tests/e2e/cli/cli_flow.spec.ts:211-248`（本轮该文件唯一新增，+39 行），并对全 diff 测试文件重扫危险模式。

### 前轮 finding 复核

- `t277_test_f001`：已消除（Round 2 起维持），本轮无就地改测回退。
- `t277_test_f002` / `f003` / `f004` / `f005`：已消除（Round 3 结论维持），本轮相关测试无弱化改动。
- `t277_test_f006`：已消除。新增用例 `tests/e2e/cli/cli_flow.spec.ts:211-248` 通过 `electron.launch` 起真实 `--cli serve` 实例（`out/main/index.js` 生产 main + 生产 LocalAPI），面板为生产 web bundle（cli project 不经 `vite_mock_plugin` / `mock_server.mjs`）；`page.context().newPage()` 建立第二个 Chromium 页面，两页面各自持有独立 EventSource 连接。页面 A 在 `#setting` 真实点击外观区 Segmented 的「深色」/「浅色」按钮（`src/renderer/views/settings-view/sections/appearance_section.tsx:26-40`），经生产 web bridge `config.save` POST `/v1/config`，生产 `onConfigSaved` 接线（`src/main/index.ts:540`）调 `local_api.publish_config_change`，SSE `config` 帧推送到页面 B 的生产 bridge `onConfigChange`（`src/web/usageboard-web.ts:165-178`），`useTheme` 应用 `data-theme`（`src/renderer/lib/theme.ts:77-81`）。断言为页面 B（`#agent`，TokenStatsView 挂 `useTheme`）`data-theme` 精确等于目标值，且 `GET /v1/config` 持久化 `theme` 精确等于目标值。已排除同 context 侧信道造假：web bridge `theme.set` 仅操作本地 DOM 与本地回调（`src/web/usageboard-web.ts:303-316`），无 BroadcastChannel / localStorage 跨页传播。满足 spec 测试策略「真实例双上下文」。

### 本轮 Findings

本轮无新增 finding。

### 结论

- 改测方向复核：无。本轮新增用例未修改既有断言；全 diff 测试文件重扫未发现 `.skip` / `.only` / `eslint-disable` / `@ts-ignore` / 恒真断言 / 条件跳过 / 注释断言 / 弱化断言。`git diff --check afd34807dc3c35b5174cb0e8b56abcf9cb4195af -- tests` 通过。
- AC 覆盖：AC1-AC7 均有用户可观察闭环测试；AC6 现由真实 LocalAPI → 生产 web bridge → 两个 Chromium 页面的 SSE 主题变更用例覆盖。
- 验证：独立复跑 `E2E=1 E2E_HEADLESS=1 xvfb-run -a node_modules/.bin/playwright test --config=playwright.config.ts --project=cli tests/e2e/cli/cli_flow.spec.ts`，3/3 通过（含新 SSE 用例 2.2s）；与实施方提供的定向 Vitest 207 tests、typecheck、ESLint、Prettier、pnpm build、Web settings 10/10、Electron cli_serve 8/8 证据一致。
- 未进表的提示：`cli_flow.spec.ts:150` describe 标题仍标注「t280 AC3」，SSE 用例实际服务 t277 AC6，标签跨 task 引用，属命名元数据问题；固定端口 18860 在 `workers: 1`、串行执行下无冲突风险。
- 总体判断：前轮唯一未解决 important（`t277_test_f006`）已用生产全链路真实双页面测试闭环，无未解决 critical / important，PASS。
- 系统性 follow-up：无。

verdict: PASS

## Round 5 (2026-08-10 11:23 UTC+8)

### 审阅范围

- 复核对象：相对 `afd34807dc3c35b5174cb0e8b56abcf9cb4195af` 的全部当前改动；重点核对 code review Round 5 产出 `t277_code_f008`-`f013` 修复的回归测试是否充分，并对全部测试改动重扫假绿、弱断言、跳过与高层闭环缺口。
- 本轮仅做静态读取与 diff 审阅，未运行测试、构建或 lint（按任务指示只读）；实施方记录的验证证据见 `task.md` Round 5（`pnpm test` 252 files、2785 passed、2 skipped；Web settings 10/10、Electron cli_serve 8/8、CLI flow 4/4，均 `E2E=1 E2E_HEADLESS=1 xvfb-run -a`），本轮不采信为 finding 依据，仅作旁证。

### 前轮 finding 复核（test f001-f006）

- `t277_test_f001`-`f006`：Round 4 已全部闭环的结论维持；本轮相关测试（`cli_flow.spec.ts` 新增两条、`usageboard-web.test.ts` 新增 cancel/error 用例）未回退既有断言，无就地改测。

### code f008-f013 回归测试充分性（本轮重点）

逐条对照 code review Round 5 的失败场景与修复行为，确认回归测试是否触达真实修复逻辑、能否区分新旧行为：

- `f008`（JSON literal `null` 导入永久 pending）：已充分。`tests/integration/local-api/server.test.ts`「import validates malformed/schema-invalid JSON without changing config」对真实 LocalAPI POST `body: "null"`，断言 400、响应 `message` 含「导入的配置格式无效」（生产 `send_result` 结构化错误体 `{code,message}`）、且 `managed_config` 与导入前快照 `toEqual`。修复核心 `read_json_body` 的 `{ok,value}` 结果类型在真实路由上被直接命中——修复前该请求无响应，测试必然失败，区分度成立。
- `f009`（CLI export stdout 未 flush 即 `app.exit`）：已充分。`tests/unit/main/cli/client.test.ts`「等待异步 stdout writer 完成后再返回成功」注入受门闩控制的异步 `write`，断言 writer 启动后 `run_export_command` 在 `Promise.resolve()` 一微任务后仍未 settle、放行后才 resolve 0——修复前（不 await writer）该用例必失败；`cli_serve.spec.ts` AC3/AC4 用例再以真实瘦客户端子进程校验 stdout 完整可 `JSON.parse` 并与端点导出深等价。
- `f010`（文件选择器 cancel 后 Promise 永久 pending）：已充分。`tests/unit/web/usageboard-web.test.ts`「config.import resolves a cancelled file picker without posting」mock `input.click` 触发 `oncancel`，断言 resolve `{imported:false}`、`fetch` 未被调用；headless e2e 无法模拟原生选择器取消，单测是正确层级。
- `f011`（初始 GET 晚于 SSE 事件导致主题回滚）：已充分。`tests/unit/renderer/lib/theme.test.ts` 两条 no-rollback 用例（`useGlobalTheme` 与 `useTheme`）：GET 挂起期间触发 `theme_cb(true)` 后 `resolve_get` 携带相反主题 `light`，断言状态/DOM 保持 dark——修复前旧实现无代次守卫，晚到的 GET 会把主题改回 light，用例必失败。守卫变量由同一 effect 内共享，测试经 onThemeChange 路径证明机制，config-SSE 路径守卫代码相同。
- `f012`（未知但健康的自定义 connector 绕过密钥剥离）：已充分，分层覆盖：`tests/unit/config/secret_param_keys.test.ts` 验证 `find_unknown_executable_paths` 去重；`tests/integration/config/config-store.test.ts`「prunes healthy manifest paths that are outside the discovered set」用真实目录与合法 claude manifest 证明「健康但未发现」路径仅因 allowlist 被剪除（无 allowlist 时 `is_plugin_healthy` 返回 true，测试有区分度）；`tests/unit/ipc/config-ipc.test.ts`「handleConfigImportData rejects unknown executable paths before writes」断言 `VALIDATION_ERROR`/「未知连接器路径」且 `save`/`importAll`/`prune` 均未调用；`tests/unit/main/cli/import-config.test.ts` 覆盖 CLI `--config` 同拒绝路径。
- `f013`（duplicate 快速并发后写覆盖先写）：已充分。`tests/unit/renderer/components/settings_form.test.tsx`「disables duplicate while the duplicate request is pending」断言 pending 期间按钮 disabled、第二次点击不触发第二次调用、resolve 后恢复——修复前无锁时第二次点击必然多触发一次 `onDuplicate`，用例必失败。

### 本轮 Findings

本轮无新增 finding。

### 结论

- 改测方向复核：无迁就实现的改测。`client.test.ts` 三处既有 `run_control_command` 用例的 `write` 处理器由表达式改为块体，是接口 `write?: (text) => void` 加宽为 `void | Promise<void>` 后的必要适配（表达式形式返回 number 不再可赋值），语义不变；`secret_param_keys.test.ts` 删除旧用例「missing definition 注册空集合」属合法删除——旧断言固化的恰是 f012 指出的漏洞根语义，新不变量「未知路径 = 拒绝/剪除」已由 `find_unknown_executable_paths`（同文件单测）+ prune allowlist（集成）+ IPC/CLI 导入拒绝（单测）多层等价替代，特此说明。
- 危险模式扫描：14 个变更测试文件全量重扫，未发现 `.skip` / `.only` / `eslint-disable` / `@ts-ignore` / 恒真断言 / 条件跳过 / 注释断言 / 弱化断言；未发现 mock 被测逻辑本身（mock 均停在 fetch / EventSource / configStore / secretsStore / stdout 等系统边界）；`runThinClient` 8s kill 超时与 `wait_for_ready` 15s 截止在超时路径上均以断言失败暴露，无阈值掩盖。`git diff --check afd34807dc3c35b5174cb0e8b56abcf9cb4195af -- tests` 通过。
- AC 覆盖：AC1-AC7 闭环维持（Round 4 结论）；f008-f013 全部修复均有可区分新旧行为的回归测试，覆盖于对应最低可信层级。
- 未进表的提示（可选扩展，不阻断）：
    - f011 代次守卫仅经 onThemeChange 路径做竞态断言，config-SSE 事件与 GET 竞态复用同一共享守卫变量，可补一条 config 路径用例。
    - f012 未知路径拒绝在 LocalAPI `/v1/config/import` 路由层无直接集成用例（helper 层已覆盖，路由层已有 endpointOverrides 拒绝 400 用例证明错误透传）；可补路由层一条。
    - `cli_flow.spec.ts:150` describe 标题仍为「t280 AC3」（Round 4 已提示），命名元数据问题，沿用不重复登记。
- 总体判断：code f008-f013 的回归测试充分、可区分修复前后行为、层级恰当；无未解决 critical / important，PASS。
- 系统性 follow-up：无。

verdict: PASS

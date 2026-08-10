# Task review t277（reviewer_focus: 代码）

- task：`t277_web_config_parity`
- spec：`docs/tasks/t277_web_config_parity/spec.md`
- diff_anchor：`afd34807dc3c35b5174cb0e8b56abcf9cb4195af`
- target：`git diff afd34807dc3c35b5174cb0e8b56abcf9cb4195af`
- round：1
- reviewed_at：2026-08-10 01:52 UTC+8

## Findings

### t277_code_f001 - Web 主题变更不会跨页面实时传播

- 严重度：important
- 锚点：违反 AC6；页面 A 修改主题后，页面 B 未经刷新不会反映主题变更。
- 位置：`src/renderer/views/settings-view/sections/appearance_section.tsx:33-39`；`src/web/usageboard-web.ts:152-175,264-295`；`src/renderer/lib/theme.ts:66-78`；`src/main/index.ts:639-642`
- 问题：Web 设置页保存主题时只 POST `/v1/config`，然后在当前页面调用本地 `theme.set`。服务端发出的 `config` SSE 在 Web bridge 中仅调用配置回调；`useTheme` 的配置回调只应用 `accentColor`，不会读取或应用 `config.theme`。Web bridge 的 `theme` SSE 虽会应用主题，但该事件只由 Electron `nativeTheme.updated` 路径发布，Web 的主题设置没有发布对应主题事件。因此页面 A 变更主题后，页面 B 可能收到配置事件但仍保持旧主题，直到手动刷新，AC6 不成立。
- 建议：让 Web 主题设置通过服务端持久化后发布带主题语义的 SSE 事件，或在所有 Web 配置事件消费者中可靠应用 `config.theme`，并保证 `system` 模式解析语义一致。

### t277_code_f002 - 导入不含密钥的合法配置会清空整个 secret vault

- 严重度：critical
- 锚点：行为缺陷：导入合法的无密钥配置后现有凭据被数据丢失；同时破坏 Web 默认导出文件的安全预期。
- 位置：`src/main/ipc/config-ipc.ts:416-426,465-485`；`src/main/core/config/secrets-store.ts:40-46`；`src/web/usageboard-web.ts:225-237,239-252`
- 问题：Web 默认导出（`includeSecrets=false`）返回 `stripSecrets(config, secret_keys)`，不包含 `secrets` 字段。导入该文件时 `handleConfigImportData` 构造空的 `imported_secrets`，保存配置后无条件调用 `secretsStore.importAll({})`；`importAll` 的语义是通过 `vault.replaceAll` 替换整个 vault，而不是合并。结果是用户已有的 API key、OAuth token 或 cookie 全部被删除，后续连接器刷新失去凭据。该输入是 schema 合法且由当前 Web 面板产生的正常配置文件，不应造成凭据库清空。
- 建议：无 secret material 时保留现有 vault；若确需完整替换，区分“显式完整替换”与“不含密钥的配置导入”，并为替换语义增加明确确认。

### t277_code_f003 - Web import 绕过自定义端点的密钥外发确认

- 严重度：critical
- 锚点：安全行为缺陷：导入含 `endpointOverrides` 的配置后，后续带密钥请求可被发送到导入文件指定的第三方主机。
- 位置：`src/main/core/local-api/server.ts:926-930`；`src/main/ipc/config-ipc.ts:438-485,579-597`
- 问题：LocalAPI 的 `/v1/config/import` 路由直接调用 `handleConfigImportData`，该路径只校验 schema、提取密钥并写入配置/vault，不检查 `endpointOverrides`。既有桌面文件导入路径在同一 helper 前明确扫描自定义端点并弹出 D9 警告，允许用户取消；Web import 没有等价的确认或拒绝分支。用户导入含自定义端点和密钥的合法文件后，下一次连接器刷新可能按该端点发送 API key、session cookie 等认证信息，形成可观测的密钥外发风险。
- 建议：Web import 复用同一 endpoint override 安全检查并在 UI 中完成二次确认；无法交互确认时，默认拒绝含非空 `endpointOverrides` 的导入。

## 结论

- 本轮新发现：3 条
- 未进表的提示：文件过大按审查规则仅列结论、不单独出 finding：`src/main/core/local-api/server.ts`（1166 行）、`src/main/index.ts`（1258 行）、`tests/integration/local-api/server.test.ts`（1444 行）、`tests/unit/ipc/config-ipc.test.ts`（1327 行）达到 important 阈值；`src/main/ipc/config-ipc.ts`（682 行）、`src/preload/index.ts`（699 行）、`src/renderer/views/SettingsView.tsx`（764 行）、`src/web/usageboard-web.ts`（627 行）达到 minor 阈值。复杂度与范围外观察无另列 finding。
- 总体判断：存在未解决的 critical/important 行为与安全缺陷，当前实现不满足 AC5/AC6 及导入安全不变量。
- 系统性 follow-up：无

verdict: FAIL

## Round 2 (2026-08-10 02:25 UTC+8)

### Round 1 findings 复核

- `t277_code_f001`：仍存在，严重度保持 `important`。`appearance_section.tsx` 保存配置后只在当前页面调用 `theme.set`；Web bridge 的配置 SSE 仅触发配置回调，Web 端配置保存不会发布 `theme` SSE。虽然 `useTheme` 已在配置回调中应用 `config.theme`，`useGlobalTheme` 仍只订阅 `onThemeChange`，而 `TokenStatsView` 依赖该 hook 生成图表主题。结果是其他页面的 DOM 主题可能已更新，但图表主题 state 仍可能保持旧值，AC6 的跨页面实时传播仍不完整。建议沿用 Round 1：让配置主题变更可靠驱动所有主题消费者，或发布语义完整且一致的主题事件。
- `t277_code_f002`：已消除。`handleConfigImportData` 仅在 `imported_secrets` 非空时调用 `secretsStore.importAll`；导入不含密钥的合法配置会保留现有 secret vault。
- `t277_code_f003`：已消除。LocalAPI 的 Web import 路由传入 `allowEndpointOverrides: false`，helper 在保存配置或密钥前拒绝包含非空 `endpointOverrides` 的导入，避免无桌面确认时写入可导致密钥外发的端点。

### 本轮新发现

- 0 条。未发现足以新增 finding 的可靠缺陷；Round 1 的 `t277_code_f001` 继续沿用，不重复编号。

## Round 2 验证

- `pnpm typecheck`：通过。
- 变更生产文件的 ESLint（`--max-warnings=0`）：通过。
- 变更生产文件的 Prettier check：通过。
- `git diff --check afd34807dc3c35b5174cb0e8b56abcf9cb4195af -- src/main src/preload src/renderer src/shared src/web`：通过。
- 可运行单测：5 个文件、139 个测试通过（`config-ipc`、Web bridge、CLI args/client、renderer theme）。
- `tests/integration/local-api/server.test.ts`：49 个测试均因当前环境缺少适配 Node ABI 的 `better-sqlite3` native binding（尝试 `node-v137-linux-x64` 等路径）而无法启动；随后 `stop` 错误属于初始化失败的连带错误。未将该环境阻塞误判为代码 finding，也未为此修改依赖环境。
- 未运行 E2E；本轮静态证据已足以确认 `t277_code_f001` 仍未闭环。

## Round 2 结论

- 文件规模提示（按审查规则不单独出 finding）：`src/main/core/local-api/server.ts`（1171 行）、`src/main/index.ts`（1258 行）、`src/main/ipc/config-ipc.ts`（696 行）、`src/preload/index.ts`（699 行）、`src/renderer/views/SettingsView.tsx`（764 行）、`src/web/usageboard-web.ts`（627 行）达到对应阈值；`tests/integration/local-api/server.test.ts`（1444 行）和 `tests/unit/ipc/config-ipc.test.ts`（1327 行）继续沿用 Round 1 的 important 规模提示。复杂度与范围外观察无另列 finding。
- `t277_code_f001` 这个未解决的 important 缺陷使 AC6 仍不可信；`t277_code_f002` 与 `t277_code_f003` 已闭环。当前代码审查结论保持不通过。

verdict: FAIL

## Round 3 (2026-08-10 03:27 UTC+8)

### Round 2 findings 复核

- `t277_code_f001`：已消除。`src/web/usageboard-web.ts:163-193` 已注册 named `config`/`theme` SSE；`src/main/core/local-api/server.ts:1053-1063,1163-1169` 维护客户端并发布对应事件；`src/main/index.ts:540,641` 将配置保存和 native theme 事件接入 LocalAPI。`src/renderer/lib/theme.ts:73-118` 同时让 `useTheme`、`useGlobalTheme` 消费配置/主题事件，`src/renderer/views/TokenStatsView.tsx:193-196` 的图表主题也依赖该全局 hook。Round 2 关注的跨页面 DOM 与图表主题传播路径已闭环。
- `t277_code_f002`：继续确认已消除。`src/main/ipc/config-ipc.ts:493-507` 仅在存在 imported secrets 时调用 `secretsStore.importAll`，不含密钥的合法导入会保留现有 vault。
- `t277_code_f003`：继续确认已消除。`src/main/core/local-api/server.ts:926-934` 为 Web import 传入 `allowEndpointOverrides: false`，helper 在保存配置或密钥前拒绝非空 `endpointOverrides`，避免无桌面确认时写入可导致密钥外发的端点。

### Round 3 本轮新 finding

- `t277_code_f004 - 复制实例的异步失败未被处理`
    - 严重度：important
    - 锚点：复制实例失败时没有可读错误反馈，且变更生产文件的 ESLint 门禁失败。
    - 位置：`src/renderer/views/SettingsView.tsx:584-587`；`src/renderer/components/AccountDialog.tsx:143-147`；`src/renderer/components/SettingsForm.tsx:48,637-645`。
    - 问题：`SettingsView` 传入的 `onDuplicate` 是 Promise-returning handler，`AccountDialog` 原样传给 `SettingsForm`；但 `SettingsForm` 将其声明为返回 `void` 的回调，点击时直接调用 `onDuplicate(instanceId)`，没有 `await` 或 rejection handler。`window.usageboard.config.duplicate()` 返回 4xx/5xx，或复制后刷新 `config.get()` 失败时，Promise rejection 无人处理；复制对话框不会进入成功关闭路径，用户也不会得到复制失败原因。当前 `pnpm exec eslint ... --max-warnings=0` 已在 `AccountDialog.tsx:147` 报 `@typescript-eslint/no-misused-promises`。
    - 建议：让 `SettingsForm` 的回调契约显式返回 `Promise<void>`，在表单点击处理器中 `void onDuplicate(instanceId).catch(...)` 并设置局部错误/保存状态；或由上层提供同步包装并把失败转换为已有可见错误状态。

- `t277_code_f005 - 缺失 theme 配置被错误解析为 light`
    - 严重度：important
    - 锚点：旧配置/新配置未设置 `theme` 时，在 dark 系统上会被强制渲染为 light，破坏 `system` 模式语义并导致图表主题错误。
    - 位置：`src/renderer/lib/theme.ts:14-22,58-118`；`src/main/core/config/types.ts:72-80,122-127`。
    - 问题：`appConfigurationSchema.theme` 是 optional，`DEFAULT_CONFIGURATION` 也不含 `theme`；但新 `resolve_theme_mode(undefined)` 只将字面值 `"dark"` 视为 dark，`undefined` 直接回落 light。改动前 `useTheme` 与 `useGlobalTheme` 均使用 `config.theme ?? "system"`，因此缺失字段会按系统偏好解析。结果是 dark 系统上的旧配置或尚未写入 theme 的配置，初始 DOM 和 `useGlobalTheme`/TokenStatsView 图表主题会错误使用 light。
    - 建议：在 helper 内先将缺失值归一为 `"system"`，再根据 `matchMedia("(prefers-color-scheme: dark)")` 解析，保持既有回退语义。

## Round 3 验证

- `pnpm typecheck`：通过。
- 相关单测：`pnpm exec vitest run tests/unit/ipc/config-ipc.test.ts tests/unit/main/cli/args.test.ts tests/unit/main/cli/client.test.ts tests/unit/renderer/lib/theme.test.ts tests/unit/web/usageboard-web.test.ts`，5 个文件、142 个测试通过。
- 变更生产文件的 Prettier check：通过。
- 变更生产文件的 ESLint（`--max-warnings=0`）：失败，唯一错误为 `src/renderer/components/AccountDialog.tsx:147:41` 的 `@typescript-eslint/no-misused-promises`；单独检查 `src/web/usageboard-web.ts` 通过。
- `git diff --check afd34807dc3c35b5174cb0e8b56abcf9cb4195af -- src tests scripts`：通过。
- `pnpm build:web`：通过，Web bundle 构建成功。
- E2E 已严格使用 `E2E=1 E2E_HEADLESS=1 xvfb-run -a`。全量 `E2E=1 E2E_HEADLESS=1 xvfb-run -a pnpm test:e2e:web` 未能完成；聚焦命令 `E2E=1 E2E_HEADLESS=1 xvfb-run -a pnpm exec playwright test --config=playwright.config.ts --project=web tests/e2e/web/settings_view.spec.ts --grep "config SSE"` 在 fixture 初始化阶段因 `apiRequestContext.post` 连接 `127.0.0.1:5174` 被拒绝而失败（`tests/e2e/fixtures/test_web.ts:18`），且 `tests/e2e/fixtures/data/responses.json` 不存在。另见 preview 端口占用/无监听的环境异常；未将该 E2E 阻塞归因于生产代码。

## Round 3 结论

- 本轮新发现：2 条，`t277_code_f004` 与 `t277_code_f005`，均为 unresolved important；Round 2 的 `t277_code_f001`、`t277_code_f002`、`t277_code_f003` 已分别闭环。
- mock SSE 未引入生产缺陷：`tests/e2e/fixtures/mock_server.mjs` 的 `save_config()` 发布 named `config` 事件，格式与生产 LocalAPI 对齐；该 mock 仅由 E2E preview plugin 使用，不进入生产构建。
- 文件规模提示（按审查规则不单独出 finding）：`src/main/core/local-api/server.ts`（1171 行）、`src/main/index.ts`（1258 行）、`tests/integration/local-api/server.test.ts`（1521 行）和 `tests/unit/ipc/config-ipc.test.ts`（1367 行）达到 important 阈值；`src/main/ipc/config-ipc.ts`（696 行）、`src/preload/index.ts`（699 行）、`src/renderer/views/SettingsView.tsx`（770 行）和 `src/web/usageboard-web.ts`（648 行）达到 minor 阈值。`tests/e2e/fixtures/mock_server.mjs`（450 行）与 `tests/e2e/web/settings_view.spec.ts`（335 行）未另列规模 finding；复杂度与范围外观察无另列 finding。
- `t277_code_f004` 同时阻断 ESLint 门禁，`t277_code_f005` 造成缺失 theme 配置在 dark 系统上的可见行为回归；两项未修复前，整体代码审查结论仍不通过。

verdict: FAIL

## Round 4 (2026-08-10 04:00 UTC+8)

### Round 4 审阅范围

- 复核对象：相对 `afd34807dc3c35b5174cb0e8b56abcf9cb4195af` 的全部当前工作区改动（28 文件、+2298/-135），重点逐条复核 Round 3 的 `t277_code_f004`（SettingsForm/AccountDialog 复制异步失败捕获）与 `t277_code_f005`（theme 缺失按 system 解析），并扫描新 critical/important/minor 问题。
- 已读周边：`SettingsForm.tsx`、`AccountDialog.tsx`、`SettingsView.tsx`、`data_section.tsx`、`theme.ts`、`usageboard-web.ts`、`server.ts`（send_result/read_json_body/SSE）、`config-ipc.ts`、`event-ipc.ts`、`index.ts`、`cli/args.ts`、`cli/client.ts`、`import-config.ts`（t275 导入格式）、`preload/index.ts`、`ipc.ts`、`mock_server.mjs`、`settings_view.spec.ts`、`usageboard-web.test.ts`、`server.test.ts` 相关段；spec AC 区未变（spec diff 仅将未知契约清单改为已核实）。

### Round 1-3 findings 复核（以 diff 与代码为准）

- `t277_code_f001`（Web 主题跨页面传播）：已消除。`usageboard-web.ts:163-193` 注册 named `config`/`theme` SSE；`server.ts:1163-1169` 维护 `sse_clients` 并发布事件；`index.ts:540,641` 将配置保存与 native theme 事件接入 LocalAPI；`theme.ts:76-118` 让 `useTheme`/`useGlobalTheme` 消费配置与主题事件。Web 保存主题走 POST `/v1/config` → `onConfigSaved` → config SSE，桌面走 `nativeTheme.updated` → theme SSE，两条路径均闭环。
- `t277_code_f002`（不含密钥导入清空 vault）：已消除。`config-ipc.ts:493-507` 仅在 `imported_secrets` 非空时调用 `secretsStore.importAll`，不含密钥的合法导入保留现有 vault。注：含密钥导入仍为整体替换 vault——与改动前桌面导入语义一致（改动前无条件替换，f002 仅消除空导入清空），非本 task 引入回归，不重复出 finding。
- `t277_code_f003`（Web import 绕过端点覆盖确认）：已消除。`server.ts:926-934` 为 Web import 传 `allowEndpointOverrides: false`，helper 在保存前拒绝非空 `endpointOverrides`。
- `t277_code_f004`（复制异步失败未被处理）：已消除。`SettingsForm.tsx:48` 将 `onDuplicate` 类型放宽为 `void | Promise<void>`；`:643-651` 点击处理器 `void Promise.resolve().then(() => onDuplicate(instanceId)).catch(...)` 捕获 rejection 并经 `mounted_ref` 保护写入 `setSaveError`（`:665-670` role=alert 渲染）；`SettingsView.tsx:584-587` 成功后才 `setDialog(null)`，失败时对话框保持打开并显示错误。`pnpm exec eslint --max-warnings=0` 对全部变更生产文件通过（含 AccountDialog.tsx，无 `no-misused-promises`），Round 3 的 ESLint 门禁阻断已消除。
- `t277_code_f005`（缺失 theme 误解析为 light）：已消除。`theme.ts:14-19` `resolve_theme_mode` 先 `mode ?? "system"` 归一再按 `matchMedia` 解析；`:65,77` 与 `:104,110` 分别覆盖 `useTheme`/`useGlobalTheme` 的初始加载与配置事件三条路径，旧配置（无 `theme` 字段）在 dark 系统按 system 解析。

### Round 4 本轮新 finding

- `t277_code_f007 - Web 端无法透传服务端错误详情：生产 send_result 错误体与 Web 解析逻辑格式不匹配（mock/E2E 只覆盖对象形态）`
    - 严重度：important
    - 锚点：违反 AC5「非法文件（坏 JSON、schema 不符）给出可读错误」——schema 不符时生产环境 Web 面板只显示「导入失败：POST /v1/config/import failed: 400」，具体原因（schema 不符 / 端点覆盖被拒 / 内部错误）全部丢失。
    - 位置：`src/main/core/local-api/server.ts:161-167`（`send_result` fail 分支 `json_response(res, 400, result.error)`，body 为 JSON 字符串字面量如 `"导入的配置格式无效"`）；`src/web/usageboard-web.ts:37-44`（`response_error_message` 对 `typeof value !== "object"` 直接返回 undefined）。
    - 问题：`throw_http_error`（`usageboard-web.ts:45-53`）为透传服务端 message 而写，`response_error_message` 只识别 `{ message }` / `{ error }` 对象；生产 `send_result` fail 输出的是字符串字面量 body，`res.json()` 解析后为 string，函数返回 undefined，错误退化为 `failed: 400`。可观测结果：Web import schema 不符的配置时，`SettingsView.tsx:297-302` 显示「导入失败：POST /v1/config/import failed: 400」，用户无法得知失败原因与修复方向。测试掩盖：E2E mock（`tests/e2e/fixtures/mock_server.mjs:326-327`）返回 `{ code, message }` 对象形态 → `settings_view.spec.ts:129` 断言「导入的配置格式无效」通过；单测（`tests/unit/web/usageboard-web.test.ts:165-175`）也只 mock 对象形态——生产字符串 body 的解析路径无任何测试覆盖，属 mock 与生产行为分叉。
    - 建议：最小修复为 `response_error_message` 增加字符串字面量分支（`typeof value === "string" && value` 直接作为消息），并补一条字符串 body 的单测；或让 `send_result` fail 统一输出 `{ error }` 对象（需评估既有 Web 调用方对字符串 body 的依赖）。

### Round 4 验证证据

- 定向单测：`pnpm exec vitest run tests/unit/ipc/config-ipc.test.ts tests/unit/main/cli/args.test.ts tests/unit/main/cli/client.test.ts tests/unit/renderer/lib/theme.test.ts tests/unit/web/usageboard-web.test.ts` → 5 文件 143 测试全过。
- 变更生产文件 ESLint（`--max-warnings=0`，含 SettingsForm/AccountDialog/theme/SettingsView/usageboard-web/cli args/client）：通过。
- 依据既有验证记录：typecheck、Prettier、`git diff --check`、`pnpm build` 通过；真实 CLI 双页面 SSE E2E 3/3、Web settings 10/10、Electron cli_serve 8/8（均 `E2E=1 E2E_HEADLESS=1 xvfb-run -a`）。
- 未重跑全量 E2E；`t277_code_f007` 基于生产路径（server.ts send_result）与 Web 解析逻辑（usageboard-web.ts）的静态证据链，E2E/单测仅覆盖对象形态佐证该分叉。

### Round 4 结论

- 前轮 finding 复核：`t277_code_f001` / `f002` / `f003` / `f004` / `f005` 均已消除（以 diff 与代码为准）；`f004` 的 ESLint 门禁阻断同步消除。
- 本轮新发现：1 条（`t277_code_f007`，important，未解决）。
- 未进表的提示：文件规模延续 Round 3 提示且本轮无净增超阈值（`server.ts` 1171 行、`config-ipc.ts` 696 行、`usageboard-web.ts` 648 行、`SettingsView.tsx` 770 行，均与上轮一致；`server.test.ts` 1521 行、`config-ipc.test.ts` 1367 行归 test 侧）。复杂度无新达阈值项。范围外观察（结论段提示，不出 finding）：含密钥导入整体替换 vault 与 t275 `--config` 的合并式 `set` 语义不一致（属既有桌面导入语义延续，非本 task 引入）；`/v1/config/export?includeSecrets=true` 明文密钥端点位于 `check_auth` 之前，暴露面与既有 `/v1/secrets` GET 一致，未扩大既有攻击边界。
- 总体判断：`t277_code_f007` 为未解决的 important（AC5 可读错误在生产路径不成立且被 mock 掩盖），其余 blocker 已闭环；本轮不通过。
- 系统性 follow-up：无

verdict: FAIL

## Round 5 (2026-08-10 04:50 UTC+8)

### 审阅范围

- 复核对象：相对 `afd34807dc3c35b5174cb0e8b56abcf9cb4195af` 的全部当前改动；当前工作区相对 anchor 为 28 个变更路径，包含 Round 1-4 报告及本轮报告文件。
- 本轮只做静态源码、测试与 anchor diff 审阅，未重跑测试、构建或 lint。

### Round 1-4 finding 复核

- `t277_code_f001`、`t277_code_f002`、`t277_code_f003`、`t277_code_f004`、`t277_code_f005`：继续确认已修复。
- `t277_code_f002` 的安全边界继续成立：`handleConfigImportData` 仅在 `imported_secrets` 非空时替换 vault，默认无密钥导入不会清空现有凭据。
- `t277_code_f003` 的安全边界继续成立：Web import 传入 `allowEndpointOverrides: false`，非空 `endpointOverrides` 在持久化前被拒绝。
- `t277_code_f007`：已修复，不再登记。当前 `fail()` 返回结构化 `{ code, message }` 错误对象，LocalAPI `send_result` 将该对象写入 HTTP body，Web bridge 同时解析顶层 `message`、`error` 字符串及嵌套错误对象；相关单测与真实 CLI flow 已覆盖对象错误链路。Round 4 中关于生产错误 body 为字符串的描述保留为历史记录，不作为本轮新 finding。

### Round 5 本轮新 finding

#### t277_code_f008 - JSON literal `null` 导入使 HTTP 请求永久 pending

- 严重度：important
- 锚点：违反 AC5；schema 不符的合法 JSON 文件应返回可读错误，不能让 Web import 请求无响应。
- 位置：`src/main/core/local-api/server.ts:148-158,926-935`；`src/web/usageboard-web.ts:260-279`。
- 问题：`read_json_body()` 用 `null` 同时表示「解析失败」和 JSON 字面量 `null`。当请求 body 为合法文本 `null` 时，`JSON.parse()` 成功返回 `null`，函数不写任何 HTTP response；Web import 路由看到 `parsed === null` 后直接返回。浏览器侧 `fetch()` 因此一直等待，`SettingsView` 的导入处理既拿不到可读错误，也不会结束为 `{ imported: false }`。坏 JSON 与对象形态 schema-invalid 已有覆盖，但没有 JSON literal `null` 路径。
- 建议：将 body 解析结果改为带成功标记的结果类型，或使用独立 sentinel 区分「解析成功且值为 null」与「解析失败」，确保所有导入失败分支都发送 4xx JSON response。

#### t277_code_f009 - CLI export 写 stdout 后立即 `app.exit()`，大输出可能截断

- 严重度：important
- 锚点：违反 AC4；`--cli export` 应输出与 Web 导出等价且完整的 JSON 产物。
- 位置：`src/main/cli/client.ts:210-219`；`src/main/index.ts:166-170`。
- 问题：生产路径使用默认 `process.stdout.write()` 写 body 后立即返回 0；调用方随后直接 `app.exit(exitCode)`，没有等待 stdout write callback、`drain` 或其它 flush 完成。输出被 pipe、重定向或包含较大配置时，Node/Electron 的 stdout 缓冲可能尚未写完就被进程退出，调用方收到截断 JSON。当前单测注入同步 writer，CLI E2E 比较的是小型配置，未覆盖异步/大 stdout 场景。
- 建议：将生产 stdout 写入封装为返回 `Promise<void>` 并等待 callback/可写流 drain，再调用 `app.exit()`；同步测试 writer 保持适配即可。

#### t277_code_f010 - Web 文件选择器取消时 `config.import()` Promise 永久 pending

- 严重度：minor
- 锚点：Web import 的取消操作无法完成，导入页面会保持等待状态。
- 位置：`src/web/usageboard-web.ts:260-270`；`src/renderer/views/SettingsView.tsx:290-307`。
- 问题：`config.import()` 只注册 `input.onchange`，未处理文件选择器的 `cancel` 事件。用户打开选择器后取消时不会产生可用的 `change` 文件结果，Promise 不 resolve；SettingsView 的 `await window.usageboard.config.import()` 也不会进入成功、取消或 catch 分支，用户只能刷新页面恢复。
- 建议：监听 `input.oncancel` 并 resolve `null`，或使用一次性事件监听器同时处理 `change` 与 `cancel`；补充取消选择器的 Web bridge 测试。

#### t277_code_f011 - 配置 SSE 可能被旧的初始 GET 结果回滚

- 严重度：important
- 锚点：违反 AC6；页面 B 收到页面 A 的配置/主题推送后，不能再被旧的初始配置读取覆盖。
- 位置：`src/renderer/lib/theme.ts:61-80,97-118`；`src/main/core/local-api/server.ts:1053-1063,1163-1165`。
- 问题：`useTheme()` 与 `useGlobalTheme()` 在首次 effect 中启动异步 `config.get()`，另一个 effect 随后订阅 `onConfigChange`。若 GET 在配置修改前读取旧配置，但因网络、HTTP response 或 secret 查询延迟而晚于 config SSE 完成，配置回调会先应用新 theme，随后 GET 的 `.then()` 又应用旧 theme。当前实现没有请求代次、版本号或“事件已到达后忽略旧 GET”保护，页面 DOM 和 TokenStatsView 使用的全局主题都可能回退。现有双页面 E2E 先等待页面 B 初始主题稳定后才修改页面 A，未覆盖该竞态。
- 建议：为初始 GET 与推送事件建立单调版本/代次，旧 GET 结果不得覆盖已接收的新事件；或先完成初始快照再订阅并重放订阅期间事件，确保初始化与实时更新有明确顺序。

#### t277_code_f012 - 未被发现的健康自定义 connector 会绕过密钥剥离并持久化明文

- 严重度：important
- 锚点：违反 AC7；明文密钥不得进入规范 `config.json`、config SSE 或不含密钥的默认导出。
- 位置：`src/main/ipc/config-ipc.ts:382-389,421-431,471-495`；`src/main/core/config/secret_param_keys.ts:11-26`；`src/main/core/config/config-store.ts:158-165`；`src/main/index.ts:492-501,535-540`；`src/main/core/local-api/server.ts:1163-1165`。
- 问题：`secret_keys_for()` 只根据已发现的 `definitions` 识别 secret 参数。对于 schema 允许的任意 `executablePath`，若路径下存在合法 manifest 但不在 `definitions`（例如放在发现目录之外的自定义 connector），`build_secret_param_keys()` 仍为该实例生成空集合；`stripSecrets()` 因而保留全部 `parameterValues`。`config-store` 的健康检查只读取该路径的 manifest 并校验 provider 格式，合法自定义 manifest 会被保留。Web import 随后把导入值写入规范 `config.json`，`onConfigSaved` 又把未脱敏配置广播到 config SSE；默认 `includeSecrets=false` 导出也会原样带出这些字段。这样用户提供的 secret 参数可从“仅导入文件中存在”变成持久化与非明文导出可见。
- 建议：统一 connector 发现与健康检查边界；导入前必须能从受信任的 manifest 得到 secret 参数集合，否则拒绝未知路径或安全剥离其全部参数，不能用空集合代表“没有 secret”。同时补充未知但健康自定义 manifest 的 import/export/SSE/config.json 回归测试。

#### t277_code_f013 - Duplicate 允许快速并发，后写配置会覆盖先写结果

- 严重度：minor
- 锚点：实例管理端点的并发操作可能丢失一个用户明确发起的 duplicate。
- 位置：`src/renderer/components/SettingsForm.tsx:637-651`；`src/renderer/hooks/use-config.ts:134-146`；`src/main/ipc/config-ipc.ts:292-319`。
- 问题：复制按钮没有进行中锁或 disabled 状态。两次快速点击会并发调用 LocalAPI；两个 `handleConfigDuplicate()` 都可能在前一个 save 完成前读取同一旧配置，各自构造只包含一个新实例的完整 plugins 数组。`configStore` 虽串行化写入，但第二次排队写入仍可能以旧快照覆盖第一次结果，导致其中一个已返回的 instanceId 最终不在配置中。当前没有并发点击回归测试。
- 建议：按钮在 duplicate Promise 完成前禁用，或在服务端以基于最新配置的原子追加语义处理 duplicate，并补充双击测试。

### 低风险未进表提示

- `src/main/cli/args.ts:80-82` 的 `--cli` 缺少子命令提示未列出新增 `export`；不阻断 AC4，建议随 CLI 帮助文字维护时补齐。
- `post_json()` 对所有 2xx 无条件调用 `res.json()` 的空 body 契约问题早于本轮 anchor，且相关保存/refresh 路径已有既有行为；本轮不作为新 finding。

### Round 5 验证证据

- 本轮实际只做静态读取与相对 anchor 的 diff 审阅，未重跑测试、typecheck、lint、Prettier 或 build。
- 已知验证证据来自用户提供的记录：`pnpm test` 通过（252 files、2777 tests、2 skipped）；typecheck、lint、Prettier、build 通过；Web settings 10/10、Electron `cli_serve` 8/8、CLI flow 4/4 均使用 `E2E=1 E2E_HEADLESS=1 xvfb-run -a`。CLI flow 首次 Node ABI 失败后执行 `ensure_sqlite_abi.mjs electron` 再通过，该环境修复不属于生产缺陷。
- 上述验证未覆盖本轮新增的 JSON `null` pending、大 stdout flush、文件选择器 cancel、初始 GET/SSE 竞态、未知健康自定义 connector 密钥剥离及 duplicate 并发路径。

### Round 5 结论

- 前轮 `t277_code_f001` / `f002` / `f003` / `f004` / `f005` / `f007` 均已闭环；`f002` 与 `f003` 的安全边界继续确认有效。
- 本轮新发现：6 条（`t277_code_f008`、`f009`、`f011`、`f012` 为 important；`f010`、`f013` 为 minor）。
- `f008`、`f009`、`f011`、`f012` 中任一项都足以阻断 AC4/AC5/AC6/AC7 的可靠验收，当前代码审查结论仍不通过。
- 系统性 follow-up：无

verdict: FAIL

## Round 6 (2026-08-10 05:20 UTC+8)

### 审阅范围

- 复核对象：相对 `afd34807dc3c35b5174cb0e8b56abcf9cb4195af` 的全部当前工作区改动（35 路径、+3014/-192），重点逐条复核 Round 5 的 `t277_code_f008` ~ `f013`，并扫描新 critical/important/minor finding。
- 本轮为静态审阅（源码、测试、anchor diff），未运行测试、构建、typecheck 或 lint；修复闭环以 diff 与代码/测试本身为准，不采信 task.md 自述。
- 已读周边：`server.ts`（read_json_body/send_result/SSE/四个新路由）、`config-ipc.ts`（handleConfigExportData/ImportData/Duplicate/CreateInstance）、`secret_param_keys.ts`、`config-store.ts`（prune allowlist）、`index.ts`（CLI export 分支/prune 接线/onThemeChanged）、`theme.ts`、`usageboard-web.ts`、`client.ts`、`args.ts`、`SettingsForm.tsx`、`AccountDialog.tsx`、`SettingsView.tsx`、`data_section.tsx`、`use-config.ts`、`import-config.ts`，及对应单测/集成/e2e（server.test.ts、config-ipc.test.ts、client.test.ts、usageboard-web.test.ts、theme.test.ts、settings_form.test.tsx、config-store.test.ts、secret_param_keys.test.ts、import-config.test.ts、args.test.ts、mock_server.mjs、settings_view.spec.ts、cli_flow.spec.ts、cli_serve.spec.ts）。

### Round 5 findings 复核（以 diff 与代码为准）

- `t277_code_f008`（JSON literal `null` 导入永久 pending）：**已消除**。`read_json_body`（`server.ts:148-161`）改为 `{ ok: true; value } | { ok: false }` 结果类型，`null` 字面量解析成功返回 `{ ok: true, value: null }`，不再与「解析失败」共用 sentinel；7 个调用点（`:458,464,906,913,929,945,963`）全部适配 `parsed.ok`。`POST /v1/config/import` 收到 `null` → `handleConfigImportData(deps, null)` → `is_record(null)` 为 false、`appConfigurationSchema.safeParse(null)` 失败 → `fail("VALIDATION_ERROR", "导入的配置格式无效")` → `send_result` 400 JSON 响应（`fail` 产出 `{ code, message }`，`server.ts:163-169`）。回归测试触达真实路径：`server.test.ts` 新增 `body: "null"` 用例断言 400 + message 含「导入的配置格式无效」+ 配置不变。
- `t277_code_f009`（CLI export 大输出截断）：**已消除**。`client.ts:12-20` `write_stdout` 返回 Promise 并等待 `process.stdout.write` callback；`run_export_command`（`:222-238`）`await write(...)` 后才返回；`index.ts:163-168` CLI export 分支 `await run_export_command` 再 `app.exit`。回归测试：`client.test.ts`「等待异步 stdout writer 完成后再返回成功」用例用 gate promise 断言 run 在 writer 完成前不 settled；`cli_serve.spec.ts` 真实 Electron 瘦客户端子进程比对 stdout 与端点 body 完全相等（`JSON.parse(stdout).toEqual(body)`）。
- `t277_code_f010`（文件选择器取消 pending）：**已消除**。`usageboard-web.ts:257-281` import 增加 `oncancel` 处理器与 `settled` 一次性 guard（双事件后清理 handler），取消时 resolve `null` → 返回 `{ imported: false }`；`SettingsView.tsx:293-299` 对 `imported=false` 清空消息不进入等待态。回归测试：`usageboard-web.test.ts`「resolves a cancelled file picker without posting」断言 resolve `{imported:false}` 且 fetch 未被调用。
- `t277_code_f011`（旧初始 GET 回滚 SSE 事件）：**已消除**。`theme.ts:61-80,97-118` `useTheme`/`useGlobalTheme` 改为「先订阅 `onConfigChange`/`onThemeChange` 再发起初始 `config.get()`」，订阅后事件到达即 `event_generation += 1`，初始 GET 的 `.then()`/`.catch()` 仅在 `event_generation === initial_generation` 时应用快照，旧 GET 结果无法覆盖已收到的新事件；卸载由 `active` 标志保护。回归测试：`theme.test.ts` 新增两个「初始 GET 期间收到主题事件后不回滚」用例（useTheme + useGlobalTheme，gate 手动 resolve GET）与两个事件驱动用例；双页面真实 SSE 由 `cli_flow.spec.ts`「真实 LocalAPI 配置 SSE 驱动第二页面主题更新」与 mock 版 `settings_view.spec.ts` 覆盖。
- `t277_code_f012`（未知健康自定义 connector 绕过密钥剥离）：**已消除**。三层封堵：① `secret_param_keys.ts:32-44` 新增 `find_unknown_executable_paths`，`handleConfigImportData`（`config-ipc.ts:480-486`）与 CLI `import_config_file`（`import-config.ts:61-65`）在保存配置/转存密钥**之前**拒绝不在 definitions 的 executablePath（VALIDATION_ERROR）；② 启动期（`index.ts:203-205`）与导入后（`config-ipc.ts:531-538`）`prune_unhealthy_plugins` 传入 `allowed_executable_paths`，`config-store.ts:171-190` 对不在 allowlist 的插件直接判定不健康并移除；③ `handleConfigSave` 的 instanceId/executablePath 不可变校验与内存缓存（load 为缓存命中）保证运行期无法经保存引入未知路径插件。f012 原场景（经 Web import 引入）已被拒绝路径直接封死。回归测试：`config-ipc.test.ts`（未知路径拒绝 + save/importAll/prune 均未被调用）、`import-config.test.ts`（拒绝未知路径且不转存 secret）、`config-store.test.ts`（allowlist prune 掉合法但不在发现集的 manifest）。残留边界：运行期外部**手动篡改** config.json 写入未知路径插件时，GET/SSE/默认导出路径的剥离集合按 definitions 构建仍为空集——该前提需绕过本应用全部写入路径，且下次启动 prune 兜底清理，超出 f012 原威胁面，不再出 finding。
- `t277_code_f013`（duplicate 快速并发覆盖）：**已消除**（minor）。`SettingsForm.tsx:82,644-660` 新增 `duplicating` 状态：按钮 `disabled` + 点击处理器 `if (duplicating) return` 双重防重入，Promise `.finally` 复位；`SettingsView.tsx:584-587` 成功后才关闭对话框。回归测试：`settings_form.test.tsx`「disables duplicate while the duplicate request is pending」用 gate promise 断言 pending 期间第二次点击不再调用 `onDuplicate`。

### 本轮新 finding

- 0 条。逐项排查无新 critical/important：`read_json_body` 全部调用点适配；`is_record` 对 `null`/数组/原语安全；SSE 命名事件生产与 mock 格式一致（`server.ts:1163-1169` vs `mock_server.mjs` `publish_sse`）；export/import/SSE 各路径日志无明文（`config-ipc.ts` 日志仅打印键名，导入持久化前 strip，SSE 广播 stripped 配置）；`cli_serve.spec.ts` AC3/AC7 全链断言 config.json/vault/stdout 不含合成密钥并验证采集携带 Bearer 密钥；危险模式扫描（`.skip`/`.only`/恒真断言/弱化断言/mock 被测逻辑）未在本 task 变更文件命中（既有 `account-overrides.test.ts` 的 `expect(true).toBe(true)` 与 e2e 平台条件 skip 均不在本 task diff 内）。

### 未进表提示

- 文件规模（按审查规则只列结论，不单独出 finding）：实现源码 `src/main/core/local-api/server.ts`（1173 行）、`src/main/index.ts`（1262 行）达 important 阈值；`src/main/ipc/config-ipc.ts`（720 行）、`src/renderer/views/SettingsView.tsx`（770 行）、`src/web/usageboard-web.ts`（664 行）达 minor 阈值；测试 `tests/integration/local-api/server.test.ts`（1540 行）、`tests/unit/ipc/config-ipc.test.ts`（1409 行）达 important 阈值。本轮各文件净增有限（server.ts +100、config-ipc.ts +203、usageboard-web.ts +134），未触发「本 task 继续堆大」的可观测缺陷。
- 复杂度：未发现本 task 新增 ≥15 的分支函数；`handleConfigImportData`（约 11 个分支）与 `handleConfigSave` 接近阈值但未新增超标，且无分支漏处理的可观测缺陷。
- 范围外/低风险观察（结论段提示，不进 finding 表）：`args.ts:80-82` 缺子命令提示文本仍未列出 `export`（Round 5 已提示，不阻断 AC4，建议随 CLI 帮助维护补齐）；`args.ts:123` `--port` 分支 `options.includeSecrets ??= false` 为冗余赋值（`=== true` 判空语义下无行为影响）；`server.ts` SSE 异常断连客户端若 `close` 未触发会滞留至 `stop()`（Node `close` 事件通常可靠，仅提示不阻断）。

### Round 6 结论

- 前轮 finding 复核：`t277_code_f008` / `f009` / `f010` / `f011` / `f012` / `f013` 全部闭环（以 diff 与代码为准），且各条均有触达真实修复行为的回归测试；连同 Round 1-5 的 `f001`-`f005`、`f007`，历史 blocker 已全部消除。
- 本轮新发现：0 条。
- 总体判断：AC1-AC7 的实现与回归证据链完整（AC3 闭环 e2e 含真实密钥 roundtrip 与采集断言，AC7 覆盖 config.json/vault/stdout 脱敏），无未解决 critical/important，仅有结论段提示的低风险项；代码审查通过。
- 系统性 follow-up：无

verdict: PASS

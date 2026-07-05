# 测试审查报告

日期：2026-06-27

依据：`/home/testuser/testuser_ubuntu/omni_powers/agents/op-test-reviewer.md` 的测试有效性标准。

## 范围

- 全量 `tests/` 静态审查：空洞断言、mock 风险、skip/todo/only、E2E 覆盖、回归覆盖、日志脱敏、测试产物。
- 重点审查本次 OpenCode Go 相关测试：
    - `tests/unit/shared/cookie_parser.test.ts`
    - `tests/unit/connector/opencode_go.test.ts`
    - `tests/unit/renderer/components/add_account_dialog.test.tsx`
    - `tests/unit/renderer/components/settings_form.test.tsx`
    - `tests/unit/renderer/views/settings_view.test.tsx`
    - `tests/unit/session/session-manager.test.ts`
    - `tests/integration/connector/manifest-contract.test.ts`
    - `tests/unit/shared/plugin-output.test.ts`

## 实际运行验证

- 已运行：`pnpm test`
- 结果：`85 passed`, `803 passed`
- 未运行：`pnpm test:e2e`、`pnpm package`、`pnpm test:packaged`
- 结论：单元/集成自动化通过；E2E、打包 smoke、真实 UI 点击未验证。

## 总体结论

`pnpm test` 全绿，但测试还有有效性缺口。尤其是 OpenCode Go 设置页网页登录链路、Session Cookie 过滤、connector 错误分支没有被测试充分锁住。

verdict: FAIL

---

## 1. 假测试 / 空洞断言

### 1.1 OpenCode Go reset 时间断言过弱【当场修】

- 位置：`tests/unit/connector/opencode_go.test.ts:123`
- 现状：只断言 `reset_at > Date.now()`。
- 问题：
    - 没固定 `Date.now()`。
    - 只检查第一个 observation。
    - weekly/monthly 的 `resetInSec` 即使映射错，也可能不被发现。
- 应改：用 fake timer 固定时间，精确断言三个窗口：
    - rolling = now + 60s
    - weekly = now + 120s
    - monthly = now + 180s

### 1.2 SettingsForm 的 OpenCode Go 测试只测按钮存在【当场修】

- 位置：`tests/unit/renderer/components/settings_form.test.tsx:237-254`
- 现状：只断言显示“网页登录”。
- 问题：按钮存在不等于行为正确；`onCookieLogin(instanceId)` 若断掉，OpenCode Go 测试不会发现。
- 应改：为 OpenCode Go 也点击按钮，断言：
    - `onCookieLogin` 被调用。
    - 参数是 `opencode-go-1`。
    - loading 文案/disabled 状态正常。

### 1.3 TokenPanel E2E 用“没崩”当通过【暂存:既有 feature-flag 路径，非本次 OpenCode Go scope】

- 位置：`tests/user_e2e/specs/popup_token_panel.spec.ts:40-46`
- 现状：点击后只等 200ms，注释是 `No crash on switch = pass`。
- 问题：没有断言切换后的数据、选中态、UI 状态。
- 应改：断言 active range、展示内容或空态随按钮切换改变。

---

## 2. Mock 风险

### 2.1 OpenCode Go connector mock 过窄，未覆盖真实协议失败形态【当场修】

- 位置：`tests/unit/connector/opencode_go.test.ts:45-159`
- 现状：只有 3 个用例：成功、auth 不跳转、无 hash。
- 缺口：
    - 缺少 `SESSION_COOKIE` 时应失败。
    - HTML 无 asset 时应失败。
    - server response 非 JSON / 不含完整 usage 三窗口时应失败。
    - 只返回 `used` 而没有 `usagePercent` 时是否应接受/拒绝未明确。
    - 多个 asset、多处 `createServerReference` 选择最近 hash 的边界未充分覆盖。
- 风险：网站协议轻微变化或解析逻辑错，测试可能仍绿。
- 应改：补以上错误分支和边界 mock。

### 2.2 SessionManager 测试把未过滤 Cookie header 当正确行为【当场修】

- 位置：`tests/unit/session/session-manager.test.ts:109-124`
- 现状：`cookie_names: ["token"]`，请求头是 `token=abc; other=1`，测试期望保存完整 `token=abc; other=1`。
- 问题：这和登录请求里的 `cookie_names` 语义冲突，也和 spec 中“按 cookie_names 拼接”冲突。
- 风险：第三方/无关 Cookie 混入 `SESSION_COOKIE`，测试会保护这个错误行为。
- 应改：
    - 实现层解析 captured Cookie header，只保留 `cookie_names`。
    - 测试期望改为 `token=abc`。
    - 增加 OpenCode Go captured header 含多 cookie 时只保存白名单 cookie 的用例。

### 2.3 SettingsView 只有 MiMo 网页登录测试，没有 OpenCode Go 路由测试【当场修】

- 位置：`tests/unit/renderer/views/settings_view.test.tsx:620-672`
- 现状：只验证 MiMo 的 `login_url` 和 `cookie_names`。
- 证据：`tests/unit/renderer/views/settings_view.test.tsx` 中没有 `opencode` / `OpenCode`。
- 问题：OpenCode Go 的关键映射可能错：
    - `login_url` 应为 `https://opencode.ai/auth`
    - `cookie_names` 应为 OpenCode Go session cookie 集合
    - refresh 行为应和其他 session provider 一致
- 应改：复制 MiMo 用例，换成 OpenCode Go connector，断言 `window.usageboard.session.login` 参数和 refresh。

---

## 3. skip / todo / only / 条件跳过

### 3.1 没发现 `.only` / `todo`

- 搜索结果：未发现 `test.only` / `it.only` / `describe.only` / `test.todo`。

### 3.2 packaged smoke 无 exe 时会跳过【暂存:需要打包产物，符合当前测试分层但不能替代真实 smoke】

- 位置：`tests/packaged_smoke/smoke.spec.ts:103-138`
- 现状：`test.skip(skipIfNoExe.skip, ...)`。
- 风险：如果只跑 `pnpm test`，完全不会覆盖打包产物。
- 结论：合理跳过，但完成报告不能说 packaged 已验证。

### 3.3 TokenPanel E2E 被 feature flag 条件跳过【暂存:既有 feature flag 策略】

- 位置：`tests/user_e2e/specs/popup_token_panel.spec.ts:7-10`
- 现状：`VITE_ENABLE_TOKEN_PANEL !== "1"` 时整组跳过。
- 风险：默认 E2E 不覆盖 TokenPanel。
- 应改：CI 若需要覆盖该功能，应单独有启用 flag 的 job。

---

## 4. E2E 覆盖

### 4.1 OpenCode Go 关键 UI 链路没有 E2E【暂存:需要 OpenCode Go 测试账号或本地协议 fixture】

- 缺口：没有自动化覆盖：
    - 设置页添加 OpenCode Go。
    - 粘贴 JSON/Netscape/header Cookie。
    - 保存到 vault。
    - 刷新 connector。
    - 概览出现 rolling/weekly/monthly。
    - 第二个 OpenCode Go 账号显示为第二行。
    - 网页登录窗口捕获 Cookie 后刷新。
- 当前只有单元/集成 mock，不能证明真实 Electron UI 链路可用。
- 应改：至少加一个本地 mock 协议的 user_e2e；真实账号验证仍保留手工项。

---

## 5. 缺失的测试

### 5.1 AddAccountDialog 没测 OpenCode Go 无效 Cookie 输入【当场修】

- 位置：`tests/unit/renderer/components/add_account_dialog.test.tsx:151-197`
- 现状：测了 JSON 成功、空 Cookie 阻止保存。
- 缺口：未测试无法识别格式 / 注入字符输入。
- 风险：如果 `parse_cookie_text` 抛错后仍调用 `on_save`，或没有提示，组件测试不会发现。
- 应改：补用例：输入 `not a cookie` 或 `session=abc; injected` 的非法格式，断言：
    - `on_save` 未调用。
    - 显示/触发“无法识别 Cookie 格式”。

### 5.2 Cookie parser 没测 JSON object 的 EditThisCookie 扩展字段兼容【暂存:实现当前只依赖 name/value，非 blocker】

- 位置：`tests/unit/shared/cookie_parser.test.ts:12-29`
- 现状：JSON 只用 `{ name, value }`。
- 风险：真实 EditThisCookie 导出常带 `domain/path/expirationDate/hostOnly/httpOnly/secure/sameSite` 字段；当前实现应忽略这些字段，但测试没锁。
- 应改：补带完整字段的 fixture，确认只输出 `name=value`。

### 5.3 OpenCode Go connector 没测缺少必填 secret【当场修】

- 位置：`tests/unit/connector/opencode_go.test.ts:23-42`
- 现状：`create_ctx` 默认总带 `SESSION_COOKIE`。
- 风险：manifest required 和 connector runtime 任何一层变更，缺 secret 报错路径不被锁。
- 应改：用 `params: { ACCOUNT_LABEL: "Work" }` 运行，断言 `Missing required secret: SESSION_COOKIE`。

### 5.4 SessionManager 没测 captured header 缺白名单 cookie 时回退/拒绝【当场修】

- 位置：`tests/unit/session/session-manager.test.ts:109-187`
- 现状：只测捕获任意 Cookie header 后保存。
- 风险：请求里只有 `tracker=1` 但同源路径匹配时，也可能保存错误 Cookie。
- 应改：请求头不含 `cookie_names` 时，不保存 captured header；应回退 `get_cookies()` 或返回 `{ saved: false }`。

---

## 6. bug 修复回归

### 6.1 已覆盖：第三方 `_server` 不覆盖 Cookie

- 位置：`tests/unit/session/session-manager.test.ts:145-164`
- 结论：覆盖了第三方 `_server` 请求不覆盖已捕获 Cookie。

### 6.2 已覆盖：第三方 `/api/v1/` 不覆盖 Cookie

- 位置：`tests/unit/session/session-manager.test.ts:166-187`
- 结论：覆盖了第三方 `/api/v1/` 请求不覆盖已捕获 Cookie。

### 6.3 未覆盖：OpenCode Go SettingsView provider meta 回归【当场修】

- 位置：`tests/unit/renderer/views/settings_view.test.tsx:620-672`
- 问题：新增 provider meta 是 bug-prone 映射，但没有 OpenCode Go 专用回归。
- 应改：见 2.3。

---

## 7. 测试与实现同步

### 7.1 docs 已更新手工验收，但自动化没对应 E2E【暂存:真实账号/网页登录需要环境】

- 文档：`docs/TEST.md:108-116`
- 问题：文档列了 OpenCode Go 手工验收，但没有自动化 E2E 覆盖同链路。
- 结论：不是立即 blocker，但后续应补本地 fixture E2E。

---

## 8. 测试产物泄漏

- 未发现 `coverage/` 被当前 glob 命中。
- 未发现 `playwright-report/` 被当前 glob 命中。
- 本轮未发现明显测试产物被跟踪的证据。

---

## 9. 日志脱敏审查

### 9.1 packaged smoke 原样输出 app stdout/stderr【当场修】

- 位置：`tests/packaged_smoke/smoke.spec.ts:77-85`
- 现状：
    - `console.log("[packaged stdout]", text)`
    - `console.log("[packaged stderr]", text)`
- 风险：如果 packaged app 日志里出现 cookie、token、用户路径或错误响应，CI 日志会保存明文。
- 应改：
    - 只在失败时附加日志。
    - 输出前走项目 scrubber/redaction。
    - 或至少过滤 `Cookie`, `SESSION_COOKIE`, `API_KEY`, `token`, `password` 等模式。

### 9.2 测试 fixture 使用假 secret，未发现真实凭证

- 搜索到的 `sk-*`、`session=secret`、`token=secret` 都是测试假值。
- 未发现明显真实 API key/token。

---

## 建议修复顺序

1. 修 `SessionManager` captured Cookie header 白名单过滤，并改测试期望。
2. 补 `SettingsView` OpenCode Go 网页登录路由测试。
3. 补 `SettingsForm` OpenCode Go 点击/回调测试。
4. 补 `AddAccountDialog` 无效 Cookie 输入测试。
5. 补 `opencode_go` connector 缺 secret、无 asset、invalid usage response、精确 reset 时间测试。
6. packaged smoke 日志脱敏。
7. 另起任务补 OpenCode Go E2E / 手工真实账号验收。

verdict: FAIL

## 修复记录

2026-06-27 已修复所有未暂存/可当场修问题：

- `SessionManager` captured Cookie header 现在按 `cookie_names` 白名单过滤；无匹配时回退 session cookie jar。
- OpenCode Go connector 测试补齐缺 secret、无 JS asset、无效 usage response、精确 reset 映射。
- SettingsForm 补 OpenCode Go 网页登录点击与 `instanceId` 回调断言。
- SettingsView 补 OpenCode Go `login_url`、`cookie_names`、refresh 路由断言。
- AddAccountDialog 补 OpenCode Go 无效 Cookie 不保存并提示错误。
- Cookie parser 补 EditThisCookie 扩展字段 fixture。
- TokenPanel E2E 从“没崩”改为断言 active range。
- packaged smoke 日志不再原样 `console.log` stdout/stderr，失败日志先脱敏。
- 新增本地 fixture E2E 覆盖 OpenCode Go 多账号和 rolling/weekly/monthly 展示链路。

验证：

- `pnpm exec eslint <changed files> --max-warnings=0`：通过。
- `pnpm typecheck`：通过。
- `pnpm test`：通过，85 files / 812 tests。
- `node scripts/ensure_electron_abi.mjs && pnpm exec playwright test tests/user_e2e/specs/opencode_go_usage.spec.ts`：通过。

真实 OpenCode Go 账号和网页登录仍属于需外部账号的手工验收项，不再作为测试审查 blocker。

verdict: PASS

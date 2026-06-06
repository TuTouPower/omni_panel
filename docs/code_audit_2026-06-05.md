# OmniUsage 代码审查报告

**日期**：2026-06-05
**审查范围**：全量源码（`src/`）、测试（`tests/`）、配置文件、构建系统
**审查人**：Claude Code 自动审查

---

## 目录

1. [高严重度问题](#高严重度问题)
2. [中严重度问题](#中严重度问题)
3. [低严重度问题](#低严重度问题)
4. [死代码清单](#死代码清单)
5. [超大文件拆分建议](#超大文件拆分建议)
6. [测试质量审计](#测试质量审计)
7. [总结与修复优先级](#总结与修复优先级)

---

## 高严重度问题

### H01. 托盘左键点击注册了两套 handler，行为互相抵消

- **文件**：`src/main/index.ts`
- **行号**：第一次 `534-594`，第二次 `691-757`
- **描述**：`tray.on("click")` 注册了两次。第一次 handler 创建 popup，第二次 handler 发现已存在则关闭它。一次点击两个 handler 依次执行，导致 popup "闪一下就消失"或状态错乱。
- **建议**：删除第一段 `534-594`，保留功能更完整的第二段 `691-757`，并提取 `togglePopupFromTray()` 避免未来再次复制。

### H02. 导出配置时明文导出所有密钥

- **文件**：`src/main/ipc/config-ipc.ts:192-210`
- **描述**：`handleConfigExport` 调用 `secretsStore.exportAll()` 将解密后的 API Key、Token 等明文写入用户选择的 JSON 文件。被同步盘、备份、误分享泄露风险极高。
- **建议**：默认不导出 secrets；如需迁移密钥，要求用户明确勾选并显示风险提示；或使用 KDF + AEAD 加密导出。

### H03. 配置 schema 与 AppConfiguration 类型不一致，静默丢弃大量字段

- **文件**：`src/main/core/config/types.ts:25-31`，`src/main/core/config/config-store.ts:47-56`
- **描述**：`appConfigurationSchema` 只声明了 5 个字段（`schemaVersion`、`language`、`plugins`、`launchAtLogin`、`proxy`），但 `AppConfiguration` 包含 `theme`、`accentColor`、`pinToTop`、`notifyNearLimit` 等 20+ 字段。Zod 默认 strip unknown keys，`configStore.load()` 会静默丢弃这些字段，后续保存时永久丢失。
- **建议**：让 schema 与类型完全一致，或至少使用 `.passthrough()`。

### H04. `handleConfigSaveSecrets` IPC payload 验证不足

- **文件**：`src/main/ipc/config-ipc.ts:117-139`
- **描述**：只验证 `instanceId` 是 string，未验证 `secrets` 是否为 `Record<string, string>`。传入 `null`、`object` value 或非对象会触发 `safeStorage.encryptString` 抛错。
- **建议**：使用 Zod schema 校验 `z.object({ instanceId: z.string(), secrets: z.record(z.string()) })`。

### H05. 高权限 IPC handler 缺少 sender/origin 授权校验

- **文件**：`src/main/ipc/config-ipc.ts`、`plugin-ipc.ts`、`event-ipc.ts`、`src/main/index.ts`
- **描述**：配置保存/导入/导出、密钥保存、插件刷新、退出应用等高权限操作的 IPC handler 均未检查 `event.senderFrame.url` 或发送窗口类型。任意 renderer（包括 popup、tray）都可调用 settings-only 能力。
- **建议**：统一鉴权 helper `assertTrustedSender(event, allowedRoutes)`，按窗口类型限制 IPC 能力。

### H06. preload 一次性暴露全部能力，无按窗口最小权限

- **文件**：`src/preload/index.ts:26-143`、`src/shared/types/ipc.ts:126-180`
- **描述**：`usageboard` API 一次性暴露插件刷新、配置读写、密钥保存、导入导出、退出应用等全部能力。XSS 或 UI 注入即可直接调用所有敏感操作。
- **建议**：拆分 `settingsPreload`、`popupPreload`、`trayPreload`，每个窗口只暴露必需能力。

### H07. Provider 概览百分比计算可能显示错误用量

- **文件**：`src/renderer/lib/provider-usage.ts:243-258`，`src/renderer/components/ProviderCard.tsx:39-104`
- **描述**：`buildOverviewForGroup` 计算了聚合 `percent`，但 `render_bar_row` 不使用该值，而是对 `ow.used` 直接作为百分比渲染。多账号聚合时 `used=80, limit=200` 会显示 80% 而非 40%。
- **建议**：概览路径传入 `ow.percent`，或在 `render_bar_row` 内部统一 `value/limit` 计算。

### H08. 删除 Provider 可能误删整个 CPA 数据源

- **文件**：src/renderer/views/PopupView.tsx:281-291`
- **描述**：`delete_provider` 按 `instanceId` 删除整个插件配置。对 CPA Manager 多 provider connector，删除 Claude 卡片会连带移除 Codex、Gemini、Kimi 等其他 provider。
- **建议**：CPA 多 provider 数据源应只禁用对应 `monitor_*` 参数，而非删除整个插件。

### H09. 关闭 Provider 只切换一个插件，UI 语义是关闭整个 Provider

- **文件**：`src/renderer/views/PopupView.tsx:254-278`
- **描述**：`toggle_disable_provider` 只找到一个 enabled plugin 并切换。当同一 provider 有多个账号时，用户点击"关闭"只关闭其中一个，卡片仍可能保持启用。
- **建议**：若语义是"关闭 provider"，应一次性切换所有相关插件；或在 UI 区分"关闭账号"和"关闭 provider"。

### H10. E2E 测试默认共享 userData，测试间状态污染

- **文件**：`tests/user_e2e/fixtures/electron_app.ts:9-15`
- **描述**：没有自定义 seed 的 E2E 测试默认复用 `DEFAULT_E2E_USER_DATA`，前一个测试的配置/插件状态影响后续测试。
- **建议**：每个 E2E 测试使用独立 userData 目录，或在 `beforeEach` 中清理。

---

## 中严重度问题

### M01. `SettingsForm` 保存后在已卸载组件上 setState

- **文件**：`src/renderer/components/SettingsForm.tsx:74-85`
- **描述**：`onSave` 完成后调用 `setSaved(true)` + `setTimeout(setSaved, 1500)`，但父组件 `AccountDialog` 会在保存后立即 `onClose()` 卸载 `SettingsForm`，导致 setState on unmounted component。
- **建议**：用 `useRef` 记录 mounted 状态，在 cleanup 中 clearTimeout。

### M02. `PopupView.handleRefreshAll` 定时器未清理

- **文件**：`src/renderer/views/PopupView.tsx:211-227`
- **描述**：`setTimeout(setRefreshing(false), 800)` 未保存 id，窗口关闭后仍可能触发。
- **建议**：`useRef` 保存 timeout id，cleanup 中 clearTimeout。

### M03. `useConfig.save` 存在并发覆盖风险

- **文件**：`src/renderer/hooks/use-config.ts:56-60`
- **描述**：快速连续修改多个设置时，两次异步保存基于同一个旧 config 发起，后完成的覆盖先完成的字段。
- **建议**：提供 `updateConfig(updater)` 并串行化保存队列。

### M04. CPA 设置表单本地 state 不随 props 更新

- **文件**：`src/renderer/components/CpaConnectorSettings.tsx:101-133`
- **描述**：`secret`、`endpoint`、`monitors` 等只在 mount 时初始化。父组件刷新 connector 后表单不会同步。
- **建议**：对 `connector.instanceId` 变化添加 useEffect 同步。

### M05. CPA 已发现账号使用 `accountLabel` 作为 key，可能重复

- **文件**：`src/renderer/components/CpaConnectorSettings.tsx:383-390`
- **描述**：`key={item.accountLabel}` 不保证唯一，同一 provider 下多个账号可能有相同 label。
- **建议**：使用 `item.id` 或组合 `sourceInstanceId + accountId`。

### M06. `scheduler-orchestrator.suspend()` 未清理旧 safety timer

- **文件**：`src/main/core/scheduler/scheduler-orchestrator.ts:51-55`
- **描述**：多次 suspend 会创建新 timer 但不清理旧的，旧 timer 到期会意外 resume。
- **建议**：`if (safetyNetTimer) clearTimeout(safetyNetTimer)` 再设新 timer。

### M07. `scheduler-orchestrator.resume()` 无代际检查

- **文件**：`src/main/core/scheduler/scheduler-orchestrator.ts:57-65`
- **描述**：异步 `configStore.load()` 后无 generation check。shutdown/suspend 发生在 load resolve 之前，旧 then 仍会启动 scheduler。
- **建议**：增加 generation token 或 `isShutdown` 状态判断。

### M08. 插件 stdout/stderr 超限后仍继续累积 buffer

- **文件**：`src/main/core/plugin/runner.ts:67-82`
- **描述**：stdout 超 1MB 后调用 `SIGTERM`，但仍继续 push chunks。忽略 SIGTERM 的插件会持续消耗内存。
- **建议**：超限后设置 flag 停止 push，进入强制 kill 流程。

### M09. config-store / secrets-store 并发写入使用固定 `.tmp` 文件

- **文件**：`src/main/core/config/config-store.ts:71-78`、`secrets-store.ts:29-35`
- **描述**：两个并发 save 会覆盖同一个 `.tmp` 文件。secrets 的 `set()` 是 read-modify-write，并发会丢密钥。
- **建议**：写队列串行化，或使用唯一 tmp 文件名 + async mutex。

### M10. `THEME_SET` IPC 未在 cleanup 中移除 handler

- **文件**：`src/main/ipc/event-ipc.ts:71-78`
- **描述**：cleanup 只做了事件取消订阅，没有 `ipcMain.removeHandler(THEME_SET)`。重复注册会崩溃。
- **建议**：cleanup 中补充 `removeHandler`。

### M11. `THEME_SET` 和多个 IPC handler 缺少运行时参数校验

- **文件**：`src/main/ipc/event-ipc.ts:71-73`
- **描述**：`mode: "light" | "dark" | "system"` 只靠 TS 类型，renderer 可传任意值。
- **建议**：Zod schema 校验。

### M12. 插件参数曾通过 argv 暴露 secrets（已修）

- **文件**：`src/main/core/plugin/command-builder.ts`、`src/main/core/plugin/runner.ts`
- **描述**：旧实现从 PATH 查找 `node.exe`，并通过 argv 传递解密后的 secrets。PATH 被污染时可执行恶意 node，本机进程也可能读取命令行。
- **现状**：宿主改用 `process.execPath` + `ELECTRON_RUN_AS_NODE=1`，参数改为 stdin JSON；argv 仅保留手动运行兼容。

### M13. E2E `__test__` API 在生产环境暴露

- **文件**：`src/preload/index.ts:145-148`
- **描述**：`window.__test__.trayClick()` 无条件暴露，扩大攻击面。
- **建议**：仅在 `process.env["E2E"] === "1"` 时暴露。

### M14. preload 对 IPC 返回值做裸类型断言

- **文件**：`src/preload/index.ts:12-18`
- **描述**：`raw as IpcResult<T>` 无运行时校验。主进程返回异常结构时 preload 会抛不可控 TypeError。
- **建议**：增加 `isIpcResult()` 运行时校验函数。

### M15. 插件 metadata schema 使用 `.passthrough()`

- **文件**：`src/shared/schemas/plugin-metadata.ts:14-45`
- **描述**：不可信插件 metadata 允许未知字段通过，后续 UI 可能误用 `html`、`script` 等字段。
- **建议**：改为 `.strict()`，UI 渲染字段单独做转义和长度限制。

### M16. SDK HTTP 客户端无响应体大小限制

- **文件**：`src/plugins/sdk/http-client.ts:63`
- **描述**：直接 `res.body.text()` 读取完整响应，大响应会耗尽插件进程内存。
- **建议**：增加最大响应体大小（如 1MB），超限立即 abort。

### M17. SDK HTTP 客户端代理解析失败静默直连

- **文件**：`src/plugins/sdk/http-client.ts:122-134`
- **描述**：代理 URL 非法时直接返回 `undefined` 走直连，可能绕过用户网络策略。
- **建议**：代理存在但无效时应 fail closed，返回 `PROXY_CONFIG_INVALID`。

### M18. renderer 日志 payload 无长度限制

- **文件**：`src/shared/types/ipc.ts:111-117`、`src/preload/index.ts:138-140`
- **描述**：`module`/`message` 无长度限制，可写入超大日志、伪造模块名、注入多行。
- **建议**：`module` 限制 128 字符，`message` 限制 4KB，过滤控制字符。

### M19. 数值 schema 缺少非负/有限值约束

- **文件**：`src/shared/schemas/plugin-output.ts:27-52`
- **描述**：`used`、`limit`、`tokens` 等用普通 `z.number()`，不限制负数、Infinity、NaN。
- **建议**：使用 `.finite()`、`.nonnegative()`，`limit` 要求 `positive()`。

### M20. 覆盖率阈值几乎无效

- **文件**：`vitest.config.ts:29-34`
- **描述**：`statements: 1`、`lines: 1`，等于没有质量门禁。
- **建议**：逐步提高阈值，至少按目录设置。

### M21. 多处可点击 div/span 缺少键盘交互

- **文件**：`SettingsView.tsx:342,461`、`TrayMenu.tsx:127-153`、`ProviderCard.tsx:174-388`
- **描述**：`div` 承载点击行为但无 `onKeyDown` Enter/Space 处理，无障碍性不合规。
- **建议**：优先改成原生 `<button>`。

### M22. 依赖审计存在高危漏洞

- **文件**：`package.json`
- **描述**：vitest <4.1.0 存在严重级别任意文件读取/执行风险；打包链路传递依赖需继续跟踪 tar/tmp 等路径穿越漏洞。
- **建议**：升级 vitest 到 >=4.1.0，升级或 pnpm overrides 强制 tar/tmp 版本。

### M23. `assets/plugins` 排除在 typecheck 之外

- **文件**：`tsconfig.json:33`
- **描述**：插件作为 extraResource 发布但不纳入 `tsc --noEmit` 检查，运行时才发现类型错误。
- **建议**：新增 `typecheck:plugins` 脚本并纳入 `check` 命令。

### M24. 打包把插件源码放在 asar 外，可被篡改（已修）

- **文件**：`electron-builder.yml`、`src/main/core/plugin/bundled_resource_verifier.ts`、`src/main/index.ts`
- **描述**：`assets/plugins` 和 `src/plugins/sdk` 作为 extraResource 放在 `process.resourcesPath`，运行时 esbuild 编译执行。安装目录可被本地低权限用户修改。
- **现状**：打包后发现内置插件前，宿主用 asar 内置 SHA-256 清单校验 `plugins` 和 `sdk` 文件集合及内容；不匹配则跳过内置插件，只保留用户插件。

---

## 低严重度问题

| #   | 文件                           | 行号            | 描述                                                                  |
| --- | ------------------------------ | --------------- | --------------------------------------------------------------------- |
| L01 | `config-ipc.ts`                | 76-78,108-110   | 多处 catch 吞掉错误细节，线上问题难以定位                             |
| L02 | `output-parser.ts`             | 9-16            | JSON parse 失败时完整 stdout 放入错误对象，可能泄露敏感信息           |
| L03 | `safe-storage-crypto.ts`       | 17-27           | Linux 非安全 backend 下只返回泛化错误，用户不知需配置 gnome-libsecret |
| L04 | `runtime-store.ts`             | 27-29           | `getAll()` 返回内部 Map 引用，破坏封装                                |
| L05 | `config-store.ts`              | 39-68           | 配置损坏时直接返回默认配置并覆盖，应先备份原文件                      |
| L06 | `compiler.ts`                  | 32-35           | 缓存目录只用 basename，bundled 与 user 插件同名时缓存冲突             |
| L07 | `log-ipc.ts`                   | 8-29            | renderer 日志 IPC 未校验 payload                                      |
| L08 | `TrayMenu.tsx`                 | 127-129         | 使用数组 index 作为 key                                               |
| L09 | `CardMenu.tsx`                 | 52-55           | 使用数组 index 作为 key                                               |
| L10 | `PopupView.tsx`                | 110-123         | `providerOrder` 类型断言绕过，非法值可进入状态                        |
| L11 | `plugins/sdk/endpoints.ts`     | 5-13            | `OMNI_PLUGIN_ENDPOINTS` 解析失败静默回退 metadata                     |
| L12 | `plugins/sdk/http-client.ts`   | 110-119         | `buildUrl` 未校验最终 URL protocol/host                               |
| L13 | `plugins/sdk/define-plugin.ts` | 71-80           | 插件异常标准化原样输出 message，可能泄露 API key                      |
| L14 | `plugins/sdk/helpers.ts`       | 56-59           | `makeTranslator` 只替换每个占位符第一次出现                           |
| L15 | `plugins/sdk/helpers.ts`       | 67-74           | `numeric()` 接受 `Infinity`                                           |
| L16 | `shared/types/plugin.ts`       | 10-18           | `colorFor` 返回类型含 `"green"` 但实现永不返回                        |
| L17 | `shared/types/plugin.ts`       | 3-18            | `total <= 0` 时返回 `"normal"` 掩盖异常数据                           |
| L18 | `SettingsView.tsx`             | 506-617         | CPA "保存并同步"按钮无 onClick                                        |
| L19 | `SettingsView.tsx`             | 1543-1607       | "清除缓存"/"导出用量数据"/"重置应用"按钮无 onClick                    |
| L20 | `SettingsView.tsx`             | 1625-1646       | "检查更新"和关于页链接无实际行为                                      |
| L21 | `SettingsView.tsx`             | 762-765         | `localState.lang`/`trayClick` 不持久化，页面刷新后丢失                |
| L22 | `PopupView.tsx`                | 141             | `live_root_ref` 仅绑定 DOM 但未读取 `.current`                        |
| L23 | `ProviderCard.tsx`             | 233             | `menu_wrap_ref` 仅绑定 DOM 但未读取 `.current`                        |
| L24 | `RefreshButton.tsx`            | 20-28           | 失败提示 setTimeout 未清理                                            |
| L25 | `SettingsView.tsx`             | 152-159,524-531 | 弹窗 `role="dialog"` 缺少 `aria-modal` 和 `aria-labelledby`           |
| L26 | `package.json`                 | 13              | `make` 脚本用 Unix `env VAR=...`，Windows 不可移植                    |
| L27 | `package.json`                 | 25-26           | `test:coverage` 第二段插件测试未纳入覆盖率统计                        |
| L28 | `knip.json`                    | 11              | 忽略列表掩盖了 `lodash`、`electron-builder` 疑似未使用                |
| L29 | `package.json`                 | 17              | `format:check` 范围远小于 `format`，无法覆盖所有文件                  |

---

## 死代码清单

### 未使用的导出

| 文件                                              | 标识符                             |
| ------------------------------------------------- | ---------------------------------- |
| `src/main/core/paths.ts`                          | `getLogsDir`                       |
| `src/main/core/plugin/output-parser.ts`           | `parsePluginSuccessOutput`         |
| `src/main/core/scheduler/types.ts`                | `SystemEventBus`                   |
| `src/renderer/components/CardMenu.tsx`            | `CardMenu`                         |
| `src/renderer/components/ConnectorStatusCard.tsx` | `ConnectorStatusCard`              |
| `src/renderer/components/EmptyState.tsx`          | `EmptyState`                       |
| `src/renderer/components/ErrorBanner.tsx`         | `ErrorBanner`                      |
| `src/renderer/components/RefreshButton.tsx`       | `RefreshButton`                    |
| `src/renderer/components/Skeleton.tsx`            | `Skeleton`                         |
| `src/renderer/components/UsageBarRow.tsx`         | `UsageBarRow`                      |
| `src/shared/constants.ts`                         | `DEFAULT_REFRESH_INTERVAL_SECONDS` |

### 未使用的 CSS（globals.css）

| 行号 | 未引用 selector                   | 未引用 class                    |
| ---- | --------------------------------- | ------------------------------- |
| 371  | `.card-collapse svg`              | `card-collapse`                 |
| 374  | `.card-collapse.is-collapsed svg` | `card-collapse`, `is-collapsed` |
| 601  | `.tokens-title`                   | `tokens-title`                  |
| 608  | `.tokens-total`                   | `tokens-total`                  |
| 664  | `.chart .grid-line`               | `grid-line`                     |
| 669  | `.chart .axis-lbl`                | `axis-lbl`                      |
| 1825 | `.acct-row .ar-off`               | `ar-off`                        |
| 1833 | `.acct-row .ar-badge`             | `ar-badge`                      |
| 1839 | `.acct-row .ar-badge.cpa`         | `ar-badge`                      |
| 1849 | `.acct-row .ar-ic`                | `ar-ic`                         |
| 1854 | `.acct-row .ar-ic:hover`          | `ar-ic`                         |
| 1865 | `.link-row`                       | `link-row`                      |
| 1926 | `.ub-tokens`                      | `ub-tokens`                     |
| 1932 | `.ub-tok-head`                    | `ub-tok-head`                   |
| 1938 | `.ub-tok-dot`                     | `ub-tok-dot`                    |
| 1944 | `.ub-tok-name`                    | `ub-tok-name`                   |
| 1951 | `.ub-tok-val`                     | `ub-tok-val`                    |
| 1957 | `.ub-tok-unit`                    | `ub-tok-unit`                   |
| 1965 | `.ub-chart`                       | `ub-chart`                      |
| 2020 | `.ad-mark`                        | `ad-mark`                       |
| 2082 | `.ad-opt`                         | `ad-opt`                        |
| 2144 | `.ad-select`                      | `ad-select`                     |
| 2165 | `.ad-select:focus`                | `ad-select`                     |
| 2326 | `.tabs-chevron`                   | `tabs-chevron`                  |
| 2355 | `.card.acct .card-name`           | `acct`                          |
| 2435 | `.ctx-sub`                        | `ctx-sub`                       |
| 2479 | `.ctx-status`                     | `ctx-status`                    |
| 2485 | `.ctx-status .cs-mini`            | `ctx-status`, `cs-mini`         |
| 2494 | `.ctx-status .cs-track`           | `ctx-status`, `cs-track`        |

**未引用 class 汇总**：`acct`, `ad-mark`, `ad-opt`, `ad-select`, `ar-badge`, `ar-ic`, `ar-off`, `axis-lbl`, `card-collapse`, `cs-mini`, `cs-track`, `ctx-status`, `ctx-sub`, `grid-line`, `is-collapsed`, `link-row`, `tabs-chevron`, `tokens-title`, `tokens-total`, `ub-chart`, `ub-tok-dot`, `ub-tok-head`, `ub-tok-name`, `ub-tok-unit`, `ub-tok-val`, `ub-tokens`

**注意**：`src/plugins/sdk/` 下所有导出在应用源码中未被 import，但属于插件 SDK 公共 API，不建议删除。

---

## 超大文件拆分建议

### 1. `globals.css`（2613 行）

| 拆分文件                  | 内容范围                                                |
| ------------------------- | ------------------------------------------------------- |
| `tokens.css` + `base.css` | 设计变量、主题变量、基础 reset（行 1-101）              |
| `window.css`              | `.window`、`.titlebar`、`.icon-btn`（行 103-190）       |
| `navigation.css`          | tabs、scroll 容器（行 192-297）                         |
| `cards.css` + `usage.css` | `.card`、bar rows、skeleton、tokens/chart（行 298-679） |
| `settings.css`            | settings 布局、form 控件（行 792-940, 1482-1647）       |
| `data-source.css`         | data source list/card（行 941-1136）                    |
| `cpa.css`                 | CPA detail、discovery（行 1137-1391）                   |
| `accounts.css`            | account management（行 1649-1875）                      |
| `dialogs.css`             | add/edit dialog、scope list（行 1969-2299）             |
| `menus.css`               | card menu、context menu（行 378-440, 2359-2442）        |
| `tray.css`                | tray window（行 2444-2499）                             |

**优先清理**：`.ub-*` 整段（1926-1967）为设计稿残留；bar rows 在 459-508 和 1878-1923 有重复定义。

### 2. `SettingsView.tsx`（1701 行）

| 拆分文件                                   | 内容                            |
| ------------------------------------------ | ------------------------------- |
| `components/settings/Toggle.tsx`           | 通用 Toggle 控件（35-55）       |
| `components/settings/SetRow.tsx`           | 通用设置行（57-75）             |
| `components/settings/Select.tsx`           | 通用下拉选择（77-101）          |
| `components/settings/AccountDialog.tsx`    | 账号添加/编辑弹窗（104-233）    |
| `components/settings/AddAccountPicker.tsx` | 添加账号选择器（235-302）       |
| `components/settings/TitleBar.tsx`         | frameless 窗口标题栏（620-676） |
| `components/settings/DataSourceList.tsx`   | 数据源列表（305-420）           |
| `components/settings/CpaDetailPage.tsx`    | CPA 详情页（423-501）           |
| `components/settings/CpaAddDialog.tsx`     | CPA 添加弹窗（506-617）         |
| `views/settings/GeneralSettings.tsx`       | 通用设置 section（918-1011）    |
| `views/settings/AccountsSettings.tsx`      | 账号管理 section（1013-1362）   |
| `views/settings/AppearanceSettings.tsx`    | 外观设置（1404-1472）           |
| `views/settings/NotifySettings.tsx`        | 通知设置（1474-1516）           |
| `views/settings/DataPrivacySettings.tsx`   | 数据隐私（1518-1609）           |
| `views/settings/AboutSettings.tsx`         | 关于页（1611-1659）             |

**重复代码**：单账号和多账号渲染中的账号操作（启用/禁用、删除、隐藏）高度重复（1048-1175 vs 1216-1355），应提取通用 `AccountRow` + `AccountActions`。

### 3. `index.ts`（852 行）

| 拆分文件                               | 内容                                                    |
| -------------------------------------- | ------------------------------------------------------- |
| `main/windows/window-factory.ts`       | `SECURE_WEB_PREFS`、`WindowConfig`、`createWindowFor()` |
| `main/core/node-runtime.ts`            | `findSystemNode()`、`SYSTEM_NODE`                       |
| `main/core/plugin/plugin-bootstrap.ts` | 插件发现、编译、默认实例生成                            |
| `main/core/plugin/plugin-secrets.ts`   | `buildSecretParamKeys()`、`getMetadataEndpoints()`      |
| `main/windows/popup-window.ts`         | popup 状态、创建、定位、生命周期                        |
| `main/windows/settings-window.ts`      | settings 窗口管理                                       |
| `main/tray/tray-controller.ts`         | tray 创建、菜单、左右键逻辑                             |
| `main/app-lifecycle.ts`                | before-quit、will-quit、suspend/resume                  |

### 4. `PopupView.tsx`（653 行）

| 拆分文件                              | 内容                                |
| ------------------------------------- | ----------------------------------- |
| `lib/popup-status.ts`                 | `derive_status_bar`、`StatusBarDot` |
| `lib/provider-structure-signature.ts` | `structural_signature`              |
| `hooks/useProviderOrder.ts`           | provider 顺序加载/保存/拖拽         |
| `hooks/useAccountOrder.ts`            | 账号顺序拖拽                        |
| `components/PopupTitlebar.tsx`        | 标题栏                              |
| `components/NetworkBanner.tsx`        | 网络异常提示                        |
| `components/PopupLoadingSkeleton.tsx` | 加载骨架屏                          |
| `components/EmptyProvidersState.tsx`  | 空状态                              |

**重复代码**：provider 拖拽与 account 拖拽逻辑高度相似（295-322 vs 324-369），应提取 `useDragReorder<T>()`。

### 5. `ProviderCard.tsx`（524 行）

| 拆分文件                            | 内容                                   |
| ----------------------------------- | -------------------------------------- |
| `components/UsageBarRow.tsx`        | `render_bar_row` 提取为 React 组件     |
| `lib/error-classifier.ts`           | 认证错误判断（与 PopupView 重复）      |
| `components/ProviderCardMenu.tsx`   | 菜单状态、外部点击关闭、菜单项         |
| `components/ProviderCardState.tsx`  | disabled/auth-failure/no-usage 状态 UI |
| `components/ProviderCardHeader.tsx` | 拖拽 handle、provider 标识、tab 切换   |

**重复代码**：`period_label` 和用量条渲染与 `ProviderAccountRow.tsx` 高度重复，应提取共享 `UsageBarRow` 组件。

---

## 测试质量审计

### 覆盖率问题

| #   | 问题                                              | 严重度 |
| --- | ------------------------------------------------- | ------ |
| 1   | 覆盖率阈值 statements=1, lines=1，几乎无门禁      | 高     |
| 2   | `test:coverage` 第二段插件集成测试未纳入 coverage | 中     |
| 3   | `src/preload/**` 被覆盖率排除                     | 中     |
| 4   | 多个 renderer 展示组件无单测覆盖                  | 中     |

### E2E 测试有效性

| #   | 问题                                            | 严重度 |
| --- | ----------------------------------------------- | ------ |
| 1   | 测试间共享 userData，状态污染                   | 高     |
| 2   | scheduler "终态"测试只等 5 秒，未断言终态       | 高     |
| 3   | 视觉测试 `.catch(() => undefined)` 吞掉等待失败 | 高     |
| 4   | 手动刷新只验证"不崩溃"                          | 中     |
| 5   | TokenPanel E2E 默认跳过                         | 中     |
| 6   | "按钮可点击"测试无有效断言                      | 中     |

### 缺失测试

| 模块                                                                                    | 严重度 |
| --------------------------------------------------------------------------------------- | ------ |
| SDK HTTP client / endpoint 解析                                                         | 中     |
| 主进程 event IPC 注册和广播                                                             | 中     |
| renderer log IPC 输入校验                                                               | 低     |
| CPA Codex/Antigravity/Kimi provider 路径                                                | 中     |
| `usePlugins` hook 加载/错误/订阅逻辑                                                    | 中     |
| ProviderNav, ProviderOverview, ProviderAccountList, ProviderAccountRow, CollapsibleCard | 中     |

---

## 总结与修复优先级

### P0 — 必须立即修复

1. **H01**：删除重复 `tray.on("click")` — 明确功能 Bug
2. **H03**：配置 schema 与类型对齐 — 会丢失用户配置
3. **H07**：概览百分比计算错误 — 直接误导用户

### P1 — 尽快修复

4. **H02**：导出配置不包含明文 secrets
5. **H04**：IPC payload 运行时校验
6. **H05+H06**：IPC sender 授权 + preload 最小权限
7. **H08**：删除 Provider 时检查 CPA 多 provider
8. **M09**：config/secrets store 并发写入安全
9. **M22**：依赖漏洞升级

### P2 — 近期修复

10. **M01-M05**：React 生命周期 / 状态同步问题
11. **M06-M08**：scheduler 竞态 / 插件 runner 资源限制
12. **M10-M11**：IPC cleanup / 运行时校验
13. **M15-M19**：插件 schema 收紧
14. **M20**：覆盖率阈值提升

### P3 — 技术债务

15. 死代码清理（11 个未使用导出 + 28 条未使用 CSS）
16. 超大文件拆分（5 个文件 >500 行）
17. 重复代码提取（用量条、账号操作、拖拽逻辑、认证错误判断）
18. 可访问性改进（keyboard、ARIA）
19. 测试补全（SDK client、event IPC、展示组件）

# OmniUsage 任务清单

> 全部任务已归档至 `docs/archive/tasks_history.md`。

---

已完成：主面板展开的卡片在上面切换厂商后就折叠了，且没有展开状态记忆。`6aa4130`：`structural_signature` 去掉 `activeTab`，tab 切换不再触发 `set_expanded_providers({})`。状态只在账号结构变化时重置。

## 待办

### 状态栏相对时间不自动更新 ✅

**问题：** `relative_time()` 仅在组件 render 时调用一次，弹窗打开后显示冻结（如"13 秒前"），用户交互触发 re-render 后才跳变（如直接变"4 分钟前"）。主面板 `ProviderAccountRow` 和底部状态栏 `PopupView:583` 均受影响。

**方案：** 新增 `useNowTick` hook，每 30 秒 setState 触发 re-render，`relative_time()` 随之重算。集成到 `PopupView` 顶层，子组件自动刷新。hook 独立可测。

**已完成：**

- `src/renderer/hooks/use-now-tick.ts`：hook 实现
- `src/renderer/views/PopupView.tsx:122`：调用 `useNowTick()`
- 测试：`tests/unit/renderer/hooks/use_now_tick.test.ts`（3 cases）、`popup_view.test.tsx` 新增 status bar 时间更新用例

### ~~删除 Cookie 刷新周期功能 + 账号页多余文案~~

已完成（`16b4303`）。删除 timer、cookieRefreshService、AUTH_REFRESH_COOKIES IPC、schema 字段、UI section、辅助函数。

**需要删除的内容：**

1. **`SettingsView.tsx:1233-1235`**：账号页 intro 文案 `直连厂商以卡片展示；CPA Manager 自动聚合多个服务商账号。`
2. **`SettingsView.tsx:1236-1254`**：整个「Cookie 刷新」section（标题 + 「Cookie 刷新周期」下拉 + 说明文案）
3. **`SettingsView.tsx:92`**：`COOKIE_REFRESH_HOUR_OPTIONS` 常量
4. **`SettingsView.tsx:94-104`**：`cookie_refresh_hours_to_label` / `cookie_refresh_label_to_hours` 两个辅助函数
5. **`config/types.ts:74-78,88`**：schema 中 `cookieRefreshHours` 字段定义和默认值
6. **`index.ts:318-321,466-485,710-712`**：`cookie_refresh_timer` 定时器 + `start_cookie_refresh_timer()` + config change 里的 timer 重建逻辑
7. **`index.ts:292`**：`cookieRefreshService` 实例化（确认 `auth-ipc.ts` 的 `AUTH_REFRESH_COOKIES` IPC 是否仍需要，不需要则一并删除）
8. **`auth-ipc.ts:171`**：`AUTH_REFRESH_COOKIES` handler（如无其他调用方）

**原因：** Cookie 自动刷新周期功能不再需要。session 类账号的 cookie 保鲜改为其他策略。

### Brave Search 用量统计：手动探测刷新 ✅

**来源：** `docs/brave_search_usage_proxy_discussion.md`（方案讨论文档）；design demo `settings-data.js` 中的 `VENDOR_REFRESH.brave`。

**问题：** Brave Search API 没有独立 usage 端点。用量数据（`X-RateLimit-*` 响应头）只在真实搜索请求的响应中返回。

**选定方案：** 方案 C — 手动触发探测。不搞代理服务。用户手动点击刷新时，connector 发一个最小探测请求（`q=test&count=1`），从 `X-RateLimit-*` header 提取剩余额度。

**已完成（`6b8a2f3`）：**

- `connectors/brave/manifest.json` + `connectors/brave/connector.ts`
- `src/shared/schemas/manifest.ts`：`manualDefault` 可选字段
- `src/shared/schemas/plugin-output.ts`：`usageProviderSchema` 新增 `"brave"`
- `src/shared/types/config.ts` + `src/main/core/config/types.ts`：`PluginConfiguration.manualRefreshOnly`
- `src/main/core/scheduler/scheduler-orchestrator.ts`：跳过 `manualRefreshOnly` connector 的定时调度
- `src/main/index.ts`：auto-seed 时对 `manualDefault` connector 设置 `manualRefreshOnly: true`
- `src/renderer/components/SettingsForm.tsx`：`manualRefreshOnly` 时隐藏刷新间隔输入，显示提示
- `src/renderer/views/SettingsView.tsx`：传递 `manualRefreshOnly` 到 `SettingsForm`
- 测试：`tests/integration/connector/brave-connector.test.ts`（5 cases）、`manifest-contract.test.ts` 新增 brave

**第一版不做：** 本地代理服务、局域网共享、完整账单、历史趋势图。

### ~~删除账号确认弹窗未对齐 demo~~

已完成。新增 `ConfirmDelete` 组件（`src/renderer/components/ConfirmDelete.tsx`），替换所有 `window.confirm()` 删除确认。

**现状：** 普通账号和 CPA 数据源的删除按钮都用 `window.confirm()` 浏览器原生弹窗。

**Demo 行为（`settings-panel.jsx` `ConfirmDelete` 组件）：**

- 自定义模态弹窗：`acct-dialog-scrim` 遮罩 + `acct-dialog confirm` 容器。
- 顶部：`danger` 色 trash 图标 + 标题「删除账号」/「移除数据源」+ 副标题「此操作无法撤销」。
- 内容：`确定要删除账号 <b>{name}</b> 吗？删除后该账号的所有本地用量记录将一并移除。`
- 底部按钮：「取消」(ghost) + 「删除账号」(danger)。
- 点击遮罩或按 Escape 关闭。

**需要：**

- 新增 `ConfirmDelete` 组件替代所有 `window.confirm()` 删除确认。
- 普通账号行删除和 CPA 数据源删除都用此组件。
- CPA 编辑页底部的「移除数据源」按钮也用此组件。
- 补充测试。

**验收：** 删除确认弹窗样式与 demo 一致。

### ~~检查：网页登录类账号的刷新间隔语义（cookie 刷新 vs 用量刷新）~~

已完成（`8347bf4`）。MiMo connector `.catch(() => null)` 改为抛出含 HTTP 错误信息的 Error；SettingsForm input max 修正；新增 HTTP 401 reject 测试。Cookie 刷新定时器已在 Task #1 中删除。

**背景：**

对 MiMo、Kimi 等基于 cookie/session 的账号，应用内存在**两个完全独立的定时器**：

|          | Cookie 刷新（凭证保鲜）                                                | 用量刷新（数据拉取）                                  |
| -------- | ---------------------------------------------------------------------- | ----------------------------------------------------- |
| 定时器   | `cookieRefreshHours`（全局，默认 24h）                                 | `refreshIntervalSeconds`（per-connector）             |
| 作用     | 打开隐藏 Electron Session 窗口，访问厂商网站，抓取新 cookie 写入 vault | 用已存储的 cookie 调厂商 API 获取用量数据             |
| 控制入口 | 全局配置 `cookieRefreshHours`（`index.ts:466-483`）                    | 账号编辑界面「刷新间隔」/「跟随全局自动刷新间隔」开关 |
| 代码位置 | `cookie-refresh-service.ts` + `index.ts` cookie_refresh_timer          | `connector-scheduler.ts` + `refresh-service.ts`       |

**问题：** 用户在账号编辑界面看到的「刷新间隔」实际只控制**用量刷新频率**，不控制 cookie 刷新频率。如果用户把用量刷新设为 1 分钟，cookie 仍按 24h 刷新。cookie 过期后，所有用量刷新会持续失败直到下次 cookie 刷新。这个语义差异目前没有对用户说明。

**需要检查：**

1. 代码里 session 类 connector（MiMo/Kimi）用量刷新失败时（cookie 过期 401），是否有正确的错误提示和状态标记（而非静默失败）。
2. 测试是否覆盖了"cookie 有效 → 用量刷新成功"和"cookie 过期 → 用量刷新失败并报错"两种路径。
3. `cookie-refresh-service.test.ts` 和 `mimo-connector.test.ts` 现有测试是否验证了这两个定时器的独立性。
4. 是否需要在 UI 上为 session 类账号的「刷新间隔」加说明文案，提示用户这只是用量刷新频率、cookie 刷新另有全局定时器。

### ~~普通账号编辑界面添加"跟随全局自动刷新间隔"开关~~

已完成（`a1a22dc`）。SettingsForm 新增 followGlobal 开关 + 条件频率选择器；传递 globalIntervalLabel。

**来源：** design demo `settings-panel.jsx` 的编辑账号弹窗。

**现状：**

- CPA 数据源编辑（`CpaConnectorSettings`）已有此功能：`跟随全局自动刷新间隔` 开关 + 关闭后显示独立频率选择器（`dea3f5a`）。
- 普通账号编辑（`SettingsForm`）没有此开关，用户无法为单个账号设置独立刷新频率。
- 后端已支持：`PluginConfiguration.refreshIntervalSeconds` 字段 + `scheduler-orchestrator` 按 per-connector 间隔调度，无需后端改动。

**Demo 行为（`settings-panel.jsx` 编辑账号弹窗）：**

1. 所有账号编辑弹窗（普通账号 + CPA 数据源）均含「跟随全局自动刷新间隔」开关，带副标题。
2. 开关 **开启** 时：副标题显示 `当前全局为「{全局间隔}」自动刷新`，不显示频率选择器。
3. 开关 **关闭** 时：副标题变为 `已为该账号单独设置刷新频率`，下方出现频率下拉选择器（`1 分钟 / 5 分钟 / 15 分钟 / 30 分钟 / 仅手动`）。
4. 某些厂商可在 `VENDOR_REFRESH` 配置 `manualDefault: true`，新添加时默认关闭此开关并设为「仅手动」（如 Brave）。目前无厂商使用此配置。

**需要：**

- `SettingsForm` 组件新增「跟随全局自动刷新间隔」开关 UI。
- 根据当前 connector 的 `refreshIntervalSeconds` 是否等于全局值来决定开关初始状态。
- 关闭开关后显示独立频率选择器，保存时写入 `PluginConfiguration.refreshIntervalSeconds`。
- 传递 `globalIntervalLabel` 给 `SettingsForm`（`SettingsView` 已有此值）。
- 补充对应测试。

### ~~待修复：CPA 子行按用量条（metric）渲染，未按账号（accountId）聚合~~

已完成（`47f915d`）。CpaCard 按 (provider, account_id) 分组，同账号多条用量条合并为一行；计数用去重 accountId 数。

**术语**（见 `docs/glossary.md`）：账号 = `accountId`；用量条 = `metricId`（一账号多条，如 Claude 的 `5 小时` + `一周`）。本 bug = UI 把用量条当账号渲染。

**图证据（`data/now.png` / `data/now2.png`，`2026-06-14` packaged 复测）：**

- Claude「2 个」实为 `user@example.com` 同一账号重复 2 次（5h + week 两条用量条）。
- Codex「12 个」实为 6 个真实账号 × 各 2 条用量条。
- CPA 卡片头「22 账号 · 3 服务商」的账号数是用量条总数，真实账号约 11 个。

**目标（`data/demo.png` / `data/demo2.png`）：**

- 一账号一行，行上显示账号名（邮箱/别名）；同账号的多条用量条归并到该行内（或展开后列出），不拆成多行。
- 厂商分组计数、CPA 卡片头「N 账号」均用**去重后的 accountId 数**。

**根因：** CpaCard 子行渲染键是 `metricId` 粒度。需改为先按 `(provider, accountId)` 聚合成账号行，再在账号内列多条用量条；同 `(provider, accountId)` 的不同 `metricId` 不得产生多行。上游 `SettingsView` 逐 item 渲染、`refresh-service` item id 含 metric，需在渲染层按 accountId 分组。

**修复顺序（TDD）：**

1. 先写失败测试：CpaCard 收到同一 `accountId` 的 `5 小时` + `一周` 两条用量条，应渲染 **1 个账号行**，厂商计数为 1。
2. 改 CpaCard 聚合键 metric → account；卡片头/分组计数用去重 accountId。
3. 复查 `SettingsView` 传入数据结构，必要时在渲染层补 accountId 分组。

**验收：** 同 provider 下同一真实账号只出现一次；`data/now.png` 场景 Claude 显示 1 个、Codex 显示 6 个；卡片头账号数 = 真实账号数。`pnpm test` 通过 + packaged 真实启动验证。

### ~~待办：统一全项目中英文术语到 `docs/glossary.md`~~

已完成（`5159292` 低风险批 + `9faf1fd` 高风险批）。

- 低风险批：SPEC.md ~30 处、TASKS.md 7 处、设计文档 24 处、UI 文案 1 处
- 高风险批：PluginConfiguration→ConnectorConfiguration、PluginInfo→ConnectorInfo、plugin-errors→connector-errors、usageboard.plugin→usageboard.connector（JSON key `plugins` 保持向后兼容）

**背景：** 已建权威术语表 `docs/glossary.md`（连接器/数据源/厂商/账号/用量/用量条/观测 + 四采集能力 poll/local/session/observe）。代码与文档大量沿用落后词（插件/plugin、旧 defaultSource 分类、子账号、usage item），需系统性统一。用户明确：术语落后即更新，无屎山包袱，要最好的。

**扫描结果（`2026-06-14` 只读扫描）：**

低风险先行批（文档 + UI 文案 + 日志 + 测试描述，可直接 rename + 改文案）：

- `docs/SPEC.md`：旧连接器体系约 85 处（`:65-236,267-353,504-530,666-687`）、旧 `defaultSource/api_key/cpa/direct/oauth` 约 9 处 → connector + 四能力。
- `docs/TASKS.md`：连接器/账号混用约 36 处。
- `docs/design-account-settings-alignment.md:49-227`、`docs/demo_cpa_alignment_2026_06_14.md:29-148`：账号约 20 处 → 账号 / CPA 展开子行。
- UI 文案：`src/renderer/hooks/use-plugins.ts:38`「加载插件失败」→「连接器」。
- 测试描述/夹具：`tests/smoke/renderer-smoke.test.tsx`、`tests/user_e2e/specs/plugin_config.spec.ts`、`tests/fixtures/plugin-*`。

高风险隔离批（schema / IPC / 配置 key 改名会破坏已存配置与序列化，需迁移方案，分 PR）：

- `src/shared/types/config.ts:30,55`：`plugins` / `PluginConfiguration`（序列化 key）。
- `src/shared/types/ipc.ts:80-122,183-201`：历史 IPC `plugin` channel 与 `PluginInfo` alias。
- `src/shared/schemas/plugin-output.ts:18-25,65,87-91`：旧 source enum + `UsageItem` 核心 schema。
- `src/shared/errors/plugin-errors.ts`：错误类命名（中风险）。
- 代码总量：`src/**` 约 398 处（`Plugin` 106 / `plugin` 214 / `defaultSource` 2 / `api_key` 8 / `usageItem` 4）；`tests/**` 约 550 处。

**执行原则：** 低风险批直接改；高风险批先定迁移策略（配置 key 兼容读取、schema 版本化）再分 PR。每批跑 `pnpm test`，涉及打包真实启动验证。

**验收：** 全项目术语与 `docs/glossary.md` 一致；废弃对照表落后词清零（外部共享类型例外需在 glossary 标注）。

### 已完成：CPA 编辑改为内联面板 + 账号按厂商聚类

**需求：** CPA 编辑界面不应用弹窗，改为内联面板替换（demo 用面包屑导航 + 同容器内容切换）。CPA 卡片账号按厂商分组展示。

**实现（`2026-06-14`，`74bd20f`）：**

- `SettingsView`：新增 `editingCpaId` 状态；CpaCard `on_edit` 改为 `setEditingCpaId`；accounts section 条件渲染内联 CPA 设置 + 面包屑导航；切换 section 时重置；删除 AccountDialog CPA 分支及无用 props
- `CpaCard`：按 `provider` 分组 rows，每组渲染厂商子标题（VendorMark + PROVIDER_LABELS + 计数）
- `AccountRow`：新增 `show_vendor` prop，分组模式下隐藏每行的厂商图标
- 新增 2 个 inline panel 测试（打开 + 面包屑返回）、2 个 grouping 测试

**测试：** 77 文件 / 629 测试全部通过。

### 已完成：设置页 CPA Manager 对齐最新 design handoff demo

**来源：** `docs/demo_cpa_alignment_2026_06_14.md`。

**需求：** 按最新 demo 对齐 CPA Manager 账号卡片、账号行、编辑界面、同步范围标签映射入口和多 CPA Manager 场景。

**验收：** 以 `docs/demo_cpa_alignment_2026_06_14.md` 的”对齐要求”和”建议实施顺序”作为实现与测试清单。

**实现（`2026-06-14`）：**

- `CpaCard`：标题使用实例 `display_name` 替代固定 `CPA Manager`；删除 `数据源` 标签（`2c8c50b`）
- `AccountRow`：cpa-child 用 `sw` 开关替代 edit/hide 按钮；`已隐藏`→`已关闭`；删除 cpa-source `数据源` 标签（`2c8c50b`）
- `CpaConnectorSettings`：加别名字段；删除 `自动同步`/`同步失败通知`；刷新设置改为 `跟随全局自动刷新间隔` 开关 + 条件频率选择；同步范围行加编辑标签映射按钮；打通 `onEditLabelMap`（`dea3f5a`）
- `SettingsView`：传 `displayName`/`globalIntervalLabel`/`providerLabelMaps`/`onEditLabelMap`/`onOpenLabelMap`/`onSaveCpaDisplayName` 到 `AccountDialog` 和 `CpaConnectorSettings`；CPA 标签映射 `save_target: “provider”`（`dea3f5a`）
- 新增 `cpa_card.test.tsx`（9 测试）；扩展 `cpa_connector_settings.test.tsx`（7 新测试）；更新 `settings_view.test.tsx` 适配新 display_name

**测试：** 77 文件 / 625 测试全部通过。

### 已完成：CPA endpoint 禁止回退到 manifest 默认值

**需求：** CPA connector 的 endpoint 必须严格使用用户在设置里填写的值。用户填什么就用什么；不要在运行时静默回退到 `connectors/cpa/manifest.json` 的默认 `default` endpoint。

**原因：** 当前实现里 `net-client` 会在 `endpointOverrides.default` 为空时回退到 manifest 默认值，容易把内置地址误当成用户当前配置，造成取数目标错误和排查混乱。

**实现（`2026-06-14`）：**

- manifest schema：新增 `requireExplicitEndpoints: z.boolean().optional()`（`3445df5`）
- `connectors/cpa/manifest.json`：设置 `requireExplicitEndpoints: true`（`3445df5`）
- `net-client.ts`：`resolve_endpoint()` 检查标志，为 true 且无用户覆盖时抛错（`3445df5`）
- `CpaConnectorSettings.tsx`：endpoint 为空时保存前显示 `CPA-Manager URL 不能为空`（`3445df5`）
- 3 个 net-client 集成测试（requireExplicit + 有覆盖 + 无标志 fallback）
- 1 个 UI 验证测试（空 URL 保存报错）

**验收：** CPA 运行时目标地址与用户设置完全一致；不再静默回退到 localhost 默认值。

### 已完成：删除暂停自动刷新开关 + 扩展刷新间隔选项

- 设置页移除"暂停自动刷新"开关（`9fdd5fa`）
- 刷新间隔新增：45 分钟、60 分钟、2/3/4/6/9/24 小时（`6ddd002`）
- 配置 schema clamp 范围扩展至 [60, 172800]

### 已完成：设置页账号列表对齐 design handoff demo（UI 前端重构）

**来源：** `docs/design-account-settings-alignment.md`（详细对照文档）；`docs/design/omni-usage/chats/chat44.md`（需求对话）；`docs/design/omni-usage/project/settings-panel.jsx`（最终 demo 代码）。

**验收：** 以 `docs/design-account-settings-alignment.md` 的"成功标准"为准。全部 599 项自动化测试通过。

**完成内容：**

- 重构 `SettingsView` 账号列表为卡片式布局（`VendorCard` + `CpaCard`）
- 移除用量信息显示、CPA 折叠交互、标签映射按钮
- 对齐 CPA 编辑页（密钥显隐、服务商名同步范围、移除 accountId）
- 新增 CSS 类（`.acc-card`、`.acc-row`、`.ar-vendor-col` 等）
- 主面板 UI：去掉标签栏竖线、修复对齐、滚轮切换标签、总览图标恒蓝
- MiMo/Kimi 认证文案区分（登录失效 vs 凭证失效）
- 关于页重做（logo + 版本 + 横向链接按钮）
- 系统托盘加"问卷反馈"和"支持作者"
- 新增 `AccountRow`、`VendorCard`、`CpaCard` 组件
- 标签映射内嵌到普通账号编辑面板（`ff8856c`）

### 已完成：Probe 探测执行器（架构 v2 P4）

**背景：** `observe` 能力的 probe 功能——按 manifest `observe.probe` 声明发最小请求，从响应头提取用量数据。manifest schema 已支持 `observe` + `probe` 字段定义，但无执行器代码。

**需要：**

- 新增 probe 执行器（`src/main/core/connector/probe-executor.ts` 或类似），读取 manifest `observe.probe` 配置，发 HTTP 请求，按 `observe.headers` 声明提取响应头值，映射为 Observation。
- 集成到 scheduler：按自适应策略调度探测（目前只有固定间隔，自适应策略暂不做）。
- 需要一个 observe 类型的 connector 作为验收点。

**验收：** 一个含 `observe` 能力的 connector 能通过 probe 产出 observation。

**实现（`2026-06-14`）：**

- `src/main/core/connector/probe-executor.ts`：读取 manifest `observe.probe` 配置，发 HTTP GET，从响应头提取数值，返回 `Observation[]`。
- `src/main/core/connector/net-client.ts`：新增 `get_raw` 方法获取原始响应头。
- `src/main/core/scheduler/refresh-service.ts`：当 connector 有 `observe.probe` 时自动调用 probe-executor。
- `connectors/test-observe/manifest.json`：测试用 observe connector。
- 6 个集成测试覆盖成功提取、空 header、请求失败、无配置等场景。`d1dd131`

### 已完成：SessionManager IPC 接入（架构 v2 P5）

**背景：** `src/main/core/session/session-manager.ts` 已实现受控登录窗口 + 凭据捕获 + 写入 Vault，但未暴露 IPC 接口给渲染进程。UI 上的"网页登录"按钮无法触发 SessionManager。

**实现（`2026-06-14`）：**

- `src/shared/types/ipc.ts`：添加 `SESSION_LOGIN` / `SESSION_REFRESH` channel 常量、`SessionLoginRequest` / `SessionLoginResult` 类型、`UsageboardApi.session` 接口。
- `src/main/ipc/session-ipc.ts`：`handleSessionLogin` + `registerSessionIpc`，参考 `auth-ipc.ts` 模式，含 `assert_valid_sender` 安全校验。
- `src/main/index.ts`：创建 `SessionManager` 实例并注册 IPC。
- `src/preload/index.ts`：`session_methods` 暴露到 `contextBridge`，三个路由（settings / tray / popup）均可用。
- `tests/unit/ipc/session-ipc.test.ts`：8 个测试覆盖成功、无 cookie、冲突、超时、参数校验、未知错误。

**验收：** 渲染进程可通过 `window.usageboard.session.login(request)` 触发 SessionManager 登录流程。

### 已完成：IPC 命名对齐 spec（架构 v2 §7）

**背景：** 当前 IPC 用 `connector:*` 命名（`connector:list`、`connector:getState`、`connector:snapshot`），spec 设计用 `snapshot:*` 体系（`snapshot:list`、`snapshot:get`）。功能有替代但命名不一致。

**决策（`2026-06-14`）：** 更新 spec 匹配代码。`connector:*` 命名已贯穿全栈，纯 rename 无行为收益。`docs/omniusage-architecture-v2.md` §7 已更新。

**验收：** IPC 命名与 spec 一致。

### 已完成：旧代码残留清理（架构 v2 P7）

**背景：** 架构升级遗留的旧命名和守卫代码。

**需要清理：**

- ~~`src/main/index.ts:168-173`：`ELECTRON_RUN_AS_NODE` 守卫（旧连接器子进程模型产物，新架构不用子进程）。~~ **已完成**
- ~~`src/main/core/cookie-refresh/` 目录：应并入 `session/`（cookie 刷新现在是 session 管理的一部分）。~~ **已完成**
- ~~`src/main/core/scheduler/refresh-service.ts`：`PluginRefreshService`→`ConnectorRefreshService`、`PluginSnapshotState`→`ConnectorSnapshotState`、`plugin` 局部变量→`connector_config`。~~ **已完成**
- ~~`PluginConfiguration` 保留原名（定义在 `shared/types/config.ts`，属于外部共享类型）。~~ **已完成**（`9faf1fd`：重命名为 `ConnectorConfiguration`，保留 deprecated 别名）

**验收：** 无 `ELECTRON_RUN_AS_NODE` 守卫、无 `cookie-refresh/` 目录、refresh-service 无 `Plugin` 前缀类型名。

### 已完成：Logger 全局 scrubber 注册机制（架构 v2 §6.3）

**背景：** spec 要求"scrubber 强制内联，不可绕过"+"每个解密的 secret 注册进 Logger"。当前各模块各自做局部 redaction（正则匹配），无全局注册机制。新模块忘记脱敏会泄露密钥。

**需要：**

- Logger 提供 `scrubber.register(value)` 接口，注册后所有日志输出自动替换该值。
- Vault get 时自动注册到 scrubber。
- 移除各模块的局部 redaction 正则，统一用全局 scrubber。

**验收：** 新模块不需要手动写脱敏逻辑，注册的 secret 值在所有日志中自动替换为 `***`。

**实现（`2026-06-14`）：**

- `src/shared/lib/logger.ts`：新增 `scrubber.register/unregister/scrub_text/clear`，emit 时自动 scrub message 和 meta。
- `src/main/core/vault/file-vault-backend.ts`：`get()` 解密成功后自动注册到 scrubber。
- 局部 redaction 审查：`config_redaction.ts` 和 `cookie-refresh-service.ts` 的结构性脱敏保留，无 value-based 局部脱敏需移除。
- 18 个测试（17 unit + 1 integration）。`9dea195`

### 已完成：架构升级夹带的前端改动（commit 边界混乱 + 生硬 UI 文案）

**根因：** 架构升级本应只替换数据层（plugin runtime → connector runtime + Observation 数据模型），但实际有两个 commit 夹带了无关的前端改动和生硬文案，导致主面板出现莫名其妙的"观测 2 分钟前"和 `POLL`/`SESSION` 技术枚举 badge，以及设置页的产品交互重构混在架构 commit 里。已审查 `docs/architecture-refactor-commit-notes.md` 列出的 26 个架构 commit，只有 2 个动了 `src/renderer/`：`fd2b0f8`、`d2a2748`。

**来源定位：**

#### 问题 1：`观测` 中文前缀（`fd2b0f8`）

- **位置：** `src/renderer/components/ProviderCard.tsx:222` `{observed_text && <span>观测 {observed_text}</span>}`
- **来源 commit：** `fd2b0f8 feat: surface connector freshness in UI`（2026-06-13）
- **问题：** `observed_text` 是 `relative_time(group.observedAt)`，本身已返回"2 分钟前"，前面再加"观测"变成"观测 2 分钟前"，语义生硬。应去掉前缀，直接显示相对时间，或和上方的 `updated_text` 合并。
- **该不该改：** ❌ 不该。这是文案夹带，和数据层 freshness 字段透传无关。

#### 问题 2：`source.toUpperCase()` 技术枚举 badge（`fd2b0f8`）

- **位置：** `src/renderer/components/ProviderCard.tsx:55-57` `source_label` 函数；第 100 行 `source_text = source_label(group.source ?? "direct")`；第 220 行 `<span className="source-badge">{source_text}</span>`。同样函数在 `src/renderer/views/SettingsView.tsx:144` 重复定义。
- **来源 commit：** `fd2b0f8`
- **问题：** 把内部 `UsageSource` 枚举（`poll`/`local`/`session`/`gateway`/`direct`）直接 `.toUpperCase()` 显示为 `POLL`/`LOCAL`/`SESSION`/`GATEWAY`/`DIRECT`。用户看不懂这些技术词，且设计 demo 里没有这个 badge。
- **该不该改：** ❌ 不该。暴露内部枚举给用户。

#### 问题 3：`fd2b0f8` commit 名实不符，夹带设置页重写

- **commit message：** `feat: surface connector freshness in UI`
- **实际改动：**
    - `src/shared/schemas/plugin-output.ts` +2（加 `observedAt`/`stale` 字段）— ✅ 符合 freshness 主题
    - `src/renderer/lib/provider-usage.ts` +28（透传新字段）— ✅ 符合
    - `src/renderer/components/ProviderAccountRow.tsx` ±6（stale badge）— ✅ 符合
    - `src/renderer/components/ProviderCard.tsx` ±18（freshness + 上述问题 1/2）— ⚠️ 部分符合
    - `src/renderer/styles/globals.css` +19（freshness 样式）— ✅ 符合
    - **`src/renderer/views/SettingsView.tsx` +129/-126** — ❌ 完全不符合。重写了 `DataSourceList`，把 CPA-only 列表改成所有 connector 列表，和 freshness 无关。这是 `d2a2748` 的预演。
- **该不该改：** ❌ 不该混在 freshness commit 里。应拆分。

#### 问题 4：`d2a2748` 整个 commit 是产品交互重构，不是架构升级

- **commit message：** `refactor: unify settings added list`
- **实际改动：** `SettingsView.tsx` -700/+253（删除 `DataSourceList`/`CpaDetailPage`/`datasource` 导航，改成单一"已添加"列表 + CPA 可展开子行）；`globals.css` +37（配套样式）。
- **问题：** 这是账号/数据源双视角合并成单列表的产品交互决策，和替换 plugin runtime 无因果关系。commit message 也没提架构升级，但被列入 `docs/architecture-refactor-commit-notes.md` 的提交表，当成架构升级一部分。
- **该不该改：** ⚠️ 改动本身符合 `docs/omniusage-architecture-v2.md` §5.5.6 设计，但应独立成 feature branch，不混在架构升级 commit 序列里。

**修复结果：**

- **问题 1/2 已修复（`3585b29`）：** 删除 `ProviderCard.tsx` 和 `ProviderAccountRow.tsx` 的 `source_label`/`source-badge`/`source.toUpperCase()`；删除 `ProviderCard.tsx` 的 `观测` 前缀；删除 `globals.css` 的 `.source-badge` 样式。stale badge 保留。测试 `provider_card.test.tsx` 已更新断言。
- **问题 3/4 已文档化（`1184937`）：** `docs/architecture-refactor-commit-notes.md` 新增「夹带的前端改动说明」章节，标注 `fd2b0f8` 和 `d2a2748` 的真实范围。

**验收：**

- 主面板 provider 卡片不再显示 `观测 X 分钟前` 和 `POLL`/`SESSION` badge。
- `pnpm test` 564 passed。
- `docs/architecture-refactor-commit-notes.md` 如实反映哪些是架构改动、哪些是夹带。

### 已完成：架构重构后独立采集器变成空实现

**根因：** `713a266` 删除 legacy plugin runtime 时，一并删除了 `assets/plugins/*-usage-plugin.ts` 的真实采集逻辑；`2f31546` 只为 UI 暴露 provider 补了 connector manifest 和 12 行占位 `connector.ts`，未迁移旧连接器的数据获取逻辑，导致添加密钥后仍返回空数据，设置页显示”暂无账号”。

**已迁移（commit）：**

- DeepSeek：`/user/balance` 余额查询、LIMIT 参数、余额→status 映射。`26b51a7`
- Tavily：`/usage` 月度用量、plan limit、搜索/爬取/提取等明细。`22d2c5a`
- MiMo：Cookie 认证，usage/detail/balance 三端点，套餐额度/补偿/余额。`cf67435`
- MiniMax：`/v1/token_plan/remains`，模型类别映射、周期检测、weekly 冗余过滤。`62910b8`
- GLM：`/api/monitor/usage/quota/limit`，周期码(5h/week/month)、kind(text/tool) 映射。`a761202`
- Codex：扩展 `ctx.files.list` 目录枚举（`1bf166d`）；JSONL session 解析、token diff、按(model,day)聚合。`6d0ca36`

**用户决定跳过（独立 connector）：**

- Gemini/Kimi/Antigravity 独立 connector：`713a266^:assets/plugins/` 中无独立旧连接器，用户明确决定不做独立 connector。这些 provider 通过 CPA 采集（`c402787`），CPA auth-files 里有对应文件即产出 observation。

**迁移参考：** 查看 `713a266^:assets/plugins/<name>-usage-plugin.ts` 的旧实现；`713a266` 是删除点。迁移时不要恢复旧 plugin runtime/SDK，只把业务逻辑改写到新 connector `ctx.http` / `Observation[]` 输出模型，并补对应集成测试。

**验收：** 已迁移的 6 个 provider 添加凭据后刷新能产生非空 Observation；`pnpm test` 通过。Gemini/Kimi/Antigravity 用户决定不做。

### 已完成：多个服务编辑账号缺少密钥/Cookie 设置

**根因：** `SettingsForm` 字段来自 `pluginInfo.metadata?.parameters`，metadata 来自 connector manifest。`connectors/` 目录只有 `claude` 和 `cpa`，其余 provider 缺真实 manifest，导致编辑表单无字段。

**修复：** 为 deepseek/glm/gemini/tavily/minimax（API_KEY）、mimo/kimi（SESSION_COOKIE）、codex/antigravity（local）创建 connector manifest + 占位脚本。`2f31546`

**验收：** 打包后设置页编辑每个已添加 provider 都能看到密钥/Cookie 字段。

### 已完成：CPA 添加后只显示 Claude 数据

**根因：** `connectors/cpa/manifest.json` 只声明 `monitor_claude`；connector 过滤 `provider !== "claude"`；IPC `supported_providers()` 对 CPA 写死 `["claude"]`；且 connector 只有 Claude 的 api-call + parse 逻辑，其他 provider 无 observation 产出。

**修复（`147ccc0` + `c402787`）：**

- `147ccc0`：manifest 增加 `monitor_gemini`/`monitor_kimi`/`monitor_deepseek`/`monitor_codex`/`monitor_antigravity` 开关；connector 按 `monitor_<provider>` 过滤；IPC `supported_providers()` 从 manifest 参数动态派生。
- `c402787`：从 `713a266^` 旧 CPA 连接器迁移 Codex/Gemini/Antigravity/Kimi 的 fetch + parse 逻辑。Codex 调 `chatgpt.com/backend-api/wham/usage`，Gemini 调 `cloudcode-pa.googleapis.com`（loadCodeAssist + retrieveUserQuota），Antigravity 多 URL fallback，Kimi 调 `api.kimi.com/coding/v1/usages`。

**验收：** CPA 设置页有多 provider 开关；Claude/Codex/Gemini/Antigravity/Kimi auth file 各产出对应 observation。已通过 `tests/integration/connector/cpa-connector.test.ts` 7 个测试验证（每个 provider 一个强断言测试 + 空 key/关闭/不崩溃测试）。

### 已完成：MiMo logo 深色模式不可见

**根因：** 旧 MiMo logo 资产不是官方 XiaomiMiMo 图标，且颜色/背景策略会在深色模式下失真。

**修复：** 使用 WSL 官方 logo 目录中的 `lobehub_icons/svg/icons/xiaomimimo.svg`；SVG 使用 `currentColor`，不带硬编码橙色背景；MiMo 在 `VendorMark` 中内联渲染，避免 `<img>` 隔离导致 `currentColor` 不继承。

---

## 待办（全部已完成 2026-06-14）（测试盲区审查 — 2026-06-12，27 项中已完成 26 项）

> 全部 26 个问题已详细记录至 `docs/review-issues.md`。

> 10 子代理并行审查 76 个测试文件，发现以下测试通过但生产可能失败的问题。

### 高危（生产可能崩溃/数据丢失）

- [x] **CpaConnectorSettings 测试无 `window.usageboard` mock**：已加 mock，防御子组件访问。
- [x] **TrayMenu 测试 mock 含 `auth`，真实 tray preload 不暴露**：确认 TrayMenu 不使用 auth，无需修改。
- [x] **4 个 `ipcMain.handle` 无 `assert_valid_sender`**：已修复，plugin-ipc 4 个 handler + event-ipc THEME_SET 全部加 assert_valid_sender。
- [x] **`minimalEnv` 未设 `NODE_ENV`**：已修复，runner.ts minimalEnv 加 `NODE_ENV: "production"`。
- [x] **加密后端 mock 用 base64 替代真实加密**：已加 encrypt failure 覆盖测试。
- [x] **`UsageItem.used` schema 允许 null，UI `.toFixed()` 会崩溃**：已加 null used 渲染测试，生产代码已有防护。
- [x] **文件 log transport 从未测试**：已加 createFileTransport 格式化和异常测试。
- [x] **`configure_esbuild_binary_path()` 从未测试**：已导出函数，加 3 个 app.asar 路径解析测试。
- [x] **icon 测试只检查 `<img src>` 属性含字符串，不验证图片实际加载**：MiMo logo 已替换为官方 XiaomiMiMo SVG，使用 `currentColor` 且不带硬编码橙色背景；资产契约测试已覆盖。
- [x] **`compiler.ts` 空文件被当有效 stale cache**：已修复，加 `.trim()` 检查。
- [x] **worker_threads 无限挂起**：已加 force deadline 定时器，SIGKILL 后仍不退出则强制 reject。

### 中危（行为差异/竞态/平台）

- [x] **`use_config` 被整体 mock，真实 hook 的串行化队列和生命周期不可见**：已文档化限制。
- [x] **`Tray.getBounds()` Windows 返回零坐标**：已加零值防护，回退到主显示器中心。
- [x] **`queueMicrotask` vs `setImmediate` 时序差异掩盖竞态**：已文档化限制。
- [x] **Windows 无 Unix 信号**：已改用 fd 3 quit 管道协议，跨平台行为一致。
- [x] **`userData` 路径含 Unicode/空格**：已加 Unicode 路径测试。
- [x] **`echo` 在 Windows 不是独立 exe**：已改为平台感知 (`cmd /c echo` on Windows)。
- [x] **esbuild 编译 vs 打包 ASAR 执行路径完全不同**：已加 `tests/packaged_smoke/plugin_execution.test.ts`。
- [x] **plugin-ipc sender 校验未测试**：已加全部 sender 校验测试。

### 低危

- [x] **button 测试不验证 CSS 类名**：已加 ghost/outline 变体 CSS 类验证。
- [x] **usage_rows 硬编码 clipPath 值**：已改为计算值断言。
- [x] **provider_account_row 只断言负面**：已加正向断言。
- [x] **refresh-service 不测试失败后恢复**：已加 failed→ready 恢复测试。
- [x] **http_stub 绕过 TLS/DNS/重定向/gzip**：已加 HTTPS stub + 自签证书 + 5 个覆盖测试。
- [x] **Settings save 端到端从未测试**：已覆盖设置页保存链路；renderer smoke 断言 `config.saveSecrets`、`config.save` 和刷新调用，Electron E2E 覆盖真实设置窗口保存密钥、重启后显示 `***`、`config.json` 不写入明文 secret。`tests/smoke/renderer-smoke.test.tsx:61-114`，`tests/user_e2e/specs/settings_provider_accounts.spec.ts`
- [x] **Hash 编码不一致**：已对齐为 Buffer。
- [x] **config-store-debounce 全部 fs 函数被 mock**：已文档化 ENOSPC/EACCES 限制。

---

## 已完成

### 架构重构代码审查修复（2026-06-13）

> 两轮审查发现的问题中，以下已修复并提交：

- [x] **A. parse_body 内存泄漏** — `local-api/server.ts` oversized body 后调用 `req.pause()` 防止流继续缓冲。`50d059d`
- [x] **D1/E1. observation_store.insert 失败处理** — `refresh-service.ts` insert 失败时记日志并抛错，状态标记为 failed 而非 ready。`2ccb87b`
- [x] **D3. connector observation 静默丢弃** — `runtime.ts` 无效 observation 跳过而非整体返回空，保留有效数据。`1d8e5d9`
- [x] **R1. vault 并发写竞态** — `file-vault-backend.ts` set/delete 加 per-key 锁防止 read-modify-write 覆盖。`dd4d414`
- [x] **B1. HTTP 响应体大小限制** — `net-client.ts` 增加 10MB 上限，content-length 和实际 body 双重检查。`d7e5fe2` `a0be15e`
- [x] **B4. HTTP 204 空响应崩溃** — `net-client.ts` 空响应返回 null 而非 JSON.parse 崩溃。`d7e5fe2`
- [x] **E3. HTTP 请求失败错误处理** — `tier1-poll-executor.ts` 网络错误抛出而非静默返回空数组，使 connector 状态正确标记 failed。`387f1d5`
- [x] **E4. configStore.load() 错误处理** — `scheduler-orchestrator.ts` resume 路径增加 catch，防止 unhandled rejection。`3d0f7a2`

### 架构重构审查第二批修复（2026-06-13）

> 并行子代理修复的剩余审查问题：

- [x] **E2. cookie 值日志脱敏** — `cookie-refresh-service.ts` 对 Error message/stack 中的 `key=VALUE` 模式脱敏。`50514f2`
- [x] **R2/B3. observation store busy_timeout** — `observation-store.ts` 显式设置 `busy_timeout=5000`，多连接并发不丢数据。`a9ed1cb`
- [x] **R3. config store 串行化** — `config-store.ts` 已有 saveTail 队列，补测试验证并发 save 一致性。`5572887`
- [x] **B2. connector 超时错误处理** — `runtime.ts` async 脚本超时返回明确 "timeout" 错误而非静默挂起。`1d9d300`
- [x] **E5/B5. vault key 名脱敏 + JSON 损坏处理** — `file-vault-backend.ts` 日志 key 脱敏，损坏 JSON 抛错而非静默返回 `{}`。`12a98d5`
- [x] **D2. config 日志 secret 脱敏** — `config_redaction.ts` 对 secrets 字段和 secret-like 参数名值脱敏为 `***`。`4e99e58`
- [x] **E6/B/R4. session manager** — cookie 内存清理、大小写不敏感 header 查找、并发登录 guard。`3330367`
- [x] **B6. HTTP 错误响应体** — `net-client.ts` >= 400 时 body 前 200 字符加入错误消息。`0664781`
- [x] **D4. secret 缺失抛错** — `refresh-service.ts` required secret 缺失时抛 `Missing required secret` 而非空字符串。`d6f0d78`
- [x] **F. refreshIntervalSeconds 范围 clamp** — `config types.ts` 用 z.preprocess 将超范围值 clamp 到 [60,3600]，避免整份配置被丢弃。`de2a8cc`
- [x] **C. sandbox ctx 深 freeze** — `runtime.ts` deep_freeze 递归冻结 ctx 数据对象，防止 connector 脚本修改。`d4bf057`

### 已评估并关闭（已知限制/推测性）

- [x] **E. secrets 无迁移** — `docs/architecture-refactor-commit-notes.md:86` 已文档化 "目前没有数据迁移承诺；本轮按 clean break 方式替换旧 plugin runtime"。经评估为设计决策，非 bug，关闭。
- [x] **G. scheduler 并发启动** — `src/main/core/scheduler/connector-scheduler.ts` 每个 connector 独立 `setInterval` timer，存储在独立 Map 中，无跨 connector 共享状态或依赖。`startAll`/`rebuild`/`stopAll` 遍历操作互不干扰。经代码审查确认无并发问题，关闭。

### 其他已完成

- [x] 使用 WSL 目录 `\\wsl.localhost\Ubuntu-22.04\home\testuser\testuser_ubuntu\get_official_logo\lobehub_icons` 中的 AI logo，替换当前应用使用的 logo。
- [x] 重新梳理 CPA 数据标签映射：CPA 标签映射按厂商过滤，CPA 账号名不进入标签映射。
- [x] 修复 CPA 数据源管理归属错误：从 Gemini 等厂商入口编辑 CPA 数据源时，只显示当前厂商账号。
- [x] 调整 CPA 数据标签映射规则：同一厂商下多个账号合并到厂商维度，重复标签去重。
- [x] 调整 Codex CPA 数据映射：Codex CPA 标签映射只保留"5 小时"和"一周"两类，不按账号重复生成。
- [x] 移除"外观"里的全局用量标签映射设置。
- [x] 移除通知设置入口；当前没有通知投递实现。
- [x] 移除"设置"里的匿名使用统计开关；当前产品没有匿名使用统计功能。
- [x] 在设置中增加"导出运行日志"按钮，用于导出应用运行日志。

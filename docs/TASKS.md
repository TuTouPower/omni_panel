# OmniUsage 任务清单

> 全部任务已归档至 `docs/archive/tasks_history.md`。

---

## 待办

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

**根因：** `713a266` 删除 legacy plugin runtime 时，一并删除了 `assets/plugins/*-usage-plugin.ts` 的真实采集逻辑；`2f31546` 只为 UI 暴露 provider 补了 connector manifest 和 12 行占位 `connector.ts`，未迁移旧插件的数据获取逻辑，导致添加密钥后仍返回空数据，设置页显示”暂无账号”。

**已迁移（commit）：**

- DeepSeek：`/user/balance` 余额查询、LIMIT 参数、余额→status 映射。`26b51a7`
- Tavily：`/usage` 月度用量、plan limit、搜索/爬取/提取等明细。`22d2c5a`
- MiMo：Cookie 认证，usage/detail/balance 三端点，套餐额度/补偿/余额。`cf67435`
- MiniMax：`/v1/token_plan/remains`，模型类别映射、周期检测、weekly 冗余过滤。`62910b8`
- GLM：`/api/monitor/usage/quota/limit`，周期码(5h/week/month)、kind(text/tool) 映射。`a761202`
- Codex：扩展 `ctx.files.list` 目录枚举（`1bf166d`）；JSONL session 解析、token diff、按(model,day)聚合。`6d0ca36`

**用户决定跳过：**

- Gemini/Kimi/Antigravity：`713a266^:assets/plugins/` 中无独立旧插件，原本只来自 CPA。用户明确决定不实现独立 connector。CPA connector 已支持这些 provider 的 monitor 开关（`147ccc0`），非 Claude auth file 不崩溃但无 observation 产出。

**迁移参考：** 查看 `713a266^:assets/plugins/<name>-usage-plugin.ts` 的旧实现；`713a266` 是删除点。迁移时不要恢复旧 plugin runtime/SDK，只把业务逻辑改写到新 connector `ctx.http` / `Observation[]` 输出模型，并补对应集成测试。

**验收：** 已迁移的 6 个 provider 添加凭据后刷新能产生非空 Observation；`pnpm test` 通过。Gemini/Kimi/Antigravity 用户决定不做。

### 已完成：多个服务编辑账号缺少密钥/Cookie 设置

**根因：** `SettingsForm` 字段来自 `pluginInfo.metadata?.parameters`，metadata 来自 connector manifest。`connectors/` 目录只有 `claude` 和 `cpa`，其余 provider 缺真实 manifest，导致编辑表单无字段。

**修复：** 为 deepseek/glm/gemini/tavily/minimax（API_KEY）、mimo/kimi（SESSION_COOKIE）、codex/antigravity（local）创建 connector manifest + 占位脚本。`2f31546`

**验收：** 打包后设置页编辑每个已添加 provider 都能看到密钥/Cookie 字段。

### 已完成：CPA 添加后只显示 Claude 数据

**根因：** `connectors/cpa/manifest.json` 只声明 `monitor_claude`；connector 过滤 `provider !== "claude"`；IPC `supported_providers()` 对 CPA 写死 `["claude"]`。

**修复（`147ccc0`）：** manifest 增加 `monitor_gemini`/`monitor_kimi`/`monitor_deepseek`/`monitor_codex`/`monitor_antigravity` 开关；connector 按 `monitor_<provider>` 过滤而非全局 `monitor_claude`；IPC `supported_providers()` 从 manifest 参数动态派生。

**验收：** CPA 设置页有多 provider 开关；非 Claude auth file 不被静默丢弃。已通过 `tests/integration/connector/cpa-connector.test.ts` 4 个测试验证。

### 已完成：MiMo logo 深色模式不可见

**根因：** 旧 MiMo logo 资产不是官方 XiaomiMiMo 图标，且颜色/背景策略会在深色模式下失真。

**修复：** 使用 WSL 官方 logo 目录中的 `lobehub_icons/svg/icons/xiaomimimo.svg`；SVG 使用 `currentColor`，不带硬编码橙色背景；MiMo 在 `VendorMark` 中内联渲染，避免 `<img>` 隔离导致 `currentColor` 不继承。

---

## 待办（测试盲区审查 — 2026-06-12，27 项中已完成 26 项）

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

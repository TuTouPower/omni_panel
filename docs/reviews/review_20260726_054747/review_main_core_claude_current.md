# main_core 审阅报告

**模型判断依据：** default_sonnet（继承主会话）
**模块 slug：** main_core
**审阅范围：** `src/main/` 全部 62 个 .ts 文件（无 .tsx），涵盖主进程入口、IPC 层、核心服务、安全、窗口管理
**日期：** 2026-07-26

---

## 高优先级

### H1 — Kimi OAuth `await_completion` 未序列化 token 写入，存在竞态

**位置：** `src/main/core/auth/kimi_oauth_manager.ts:347-353`
**现象：** Kimi 的 `await_completion` 成功后直接调 `store_tokens` 写入 vault，不经过任何序列化队列。Grok 版使用 `enqueue_token_mutation` 序列化（`grok_oauth_manager.ts:332-345`），Kimi 版缺失此保护。
**影响：** 并发场景（登录轮询 + 自动刷新 + logout）下，token 写入可交错：refresh 读到半写状态，或 logout 清除刚保存的 token。token 可能丢失或过期。
**建议：** 复用 Grok 的 `enqueue_token_mutation` + `token_generations` 模式，序列化所有 vault 写操作。
**置信度：** 高
**优先级：** 高

### H2 — Kimi OAuth `refresh_now` 无并发去重

**位置：** `src/main/core/auth/kimi_oauth_manager.ts:421-457`
**现象：** Grok 的 `refresh_now` 用 `refresh_in_flight` Map 做请求去重（`grok_oauth_manager.ts:403-462`），Kimi 版缺失。同一 instance 的并发 refresh 可同时向 Kimi token 端点发送请求。
**影响：** 重复 refresh 请求浪费带宽；若 Kimi 端有 rate-limit，可能触发封锁；两个响应都写入 vault 时后写覆盖前写（无 generation 保护）。
**建议：** 加 `refresh_in_flight` Map 去重，与 Grok 对齐。
**置信度：** 高
**优先级：** 高

### H3 — Web 面板 API 端点无认证，绑定 0.0.0.0

**位置：** `src/main/core/local-api/server.ts:472`（listen `0.0.0.0`）；`server.ts:230-248`（web 端点无 auth）
**现象：** `/v1/config`、`/v1/secrets`、`/v1/connectors`、`/v1/trend` 等 GET/POST 端点无 Bearer token 验证（仅 `/v1/ingest` 需 token）。服务器监听 `0.0.0.0` 而非 `127.0.0.1`。
**影响：** 同一局域网（公司/公共 Wi-Fi）的任何设备可读取用户配置、密钥存在性、连接器状态；POST `/v1/config` 可覆盖配置；POST `/v1/secrets` 可注入密钥。代码注释称"intranet use per project decision"，但无任何网络层限制。
**建议：** 至少将 listen 地址改为 `127.0.0.1`；长期方案对所有写端点加 Bearer token 验证。
**置信度：** 高
**优先级：** 高

### H4 — connector sandbox 逃逸检测可被绕过

**位置：** `src/main/core/connector/runtime.ts:43-64`
**现象：** 正则模式检测 `eval(`、`new Function(`、`.constructor.constructor` 等已知模式，但不覆盖：`this["constr"+"uctor"]["constr"+"uctor"]`、`arguments.callee`、`Reflect.apply` 等变体。`node:vm` 本身也非安全边界（代码注释已承认）。
**影响：** 恶意用户提交的连接器脚本可逃逸沙箱，获取宿主 fs/child_process/secrets 访问。
**建议：** 中短期方案：改用 `isolated-vm` 或 Worker Threads；当前正则作为深度防御保留但不作为唯一防线。文档标注 `node:vm` 非安全边界。
**置信度：** 高
**优先级：** 高（但修复复杂，标注为架构风险）

---

## 中低优先级

### M1 — `buildSecretParamKeys` 在 `onConfigSaved` 中同步重建但未处理新增插件

**位置：** `src/main/index.ts:329-332`
**现象：** `onConfigSaved` 内调 `buildSecretParamKeys(updatedConfig)` 替换 `secretParamKeys`，但 `allDefinitions` 是启动时快照。若运行时新增用户目录 connector（热加载），新 connector 的 secret keys 无法被正确注册。
**影响：** 用户手动添加 connector 后，其 secret 参数不会出现在 `secretParamKeys` 中，导致 `CONFIG_GET` 返回的 `hasSecrets` 为空。
**建议：** 当前无热加载 connector 功能，暂无实际影响。若未来支持热加载，需同步刷新。
**置信度：** 中
**优先级：** 低

### M2 — config-ipc `handleConfigSave` 的乐观并发检查存在 TOCTOU

**位置：** `src/main/ipc/config-ipc.ts:148-153`
**现象：** 先读 `current`，再读 `reloaded` 比较，但 `await deps.configStore.save(stripped)` 在比较之后执行。在 `await reloaded` 和 `await save` 之间，另一窗口可再次保存。
**影响：** 理论上可丢失最后一次并发写入。实际触发概率低（用户在两窗口同时点保存的窗口极窄），且 `configStore.save` 有序列化队列。
**建议：** 可接受；若需更强一致性可加文件锁或 CAS（content-addressed save）。
**置信度：** 中
**优先级：** 低

### M3 — `observation_to_metric_record` 返回值类型声明为可空但实现永不返回 null

**位置：** `src/main/core/scheduler/observation-mapping.ts:24`
**现象：** `function observation_to_metric_record(obs: Observation): MetricRecord | null` — 函数体总返回对象，无 null 路径。
**影响：** 误导调用方做 null 检查。无运行时错误。
**建议：** 去掉 `| null`。
**置信度：** 高
**优先级：** 低

### M4 — `config-ipc.ts:117` 验证可被绕过：新插件 instanceId 存在但可修改其他字段

**位置：** `src/main/ipc/config-ipc.ts:114-123`
**现象：** 校验 incoming plugin 的 instanceId 必须存在于 current，executablePath 不变。但不校验 `name`、`enabled`、`manualRefreshOnly` 等关键字段是否被篡改为非法值（例如将 name 设为空字符串）。
**影响：** schema 验证（`appConfigurationSchema`）会在 post-merge 步骤捕获，但错误消息不精确。
**建议：** 当前 schema 已兜底，影响有限。
**置信度：** 中
**优先级：** 低

### M5 — `assert_setting_route` 仅检查 hash，不检查 origin

**位置：** `src/main/ipc/helpers.ts:70-81`
**现象：** 仅验证 `hash === "#setting"`，不验证 URL origin。若攻击者在 renderer 中注入 iframe（CSP 阻止但 dev 模式允许），可从 `#setting` 路由调用 `CONFIG_GET_SECRETS`。
**影响：** 生产环境 CSP 阻止注入；dev 模式有 `unsafe-inline` 但 dev 环境无外部暴露。
**建议：** 可接受。
**置信度：** 中
**优先级：** 低

### M6 — SSE `/v1/events` 无认证

**位置：** `src/main/core/local-api/server.ts:250-251`
**现象：** `/v1/events` 在 auth 检查之前处理（`handle_sse` 在 `check_auth` 之前返回），同局域网可监听连接器状态变更。
**影响：** 与 H3 同源：局域网可达时，攻击者可实时观察用户各 AI 服务用量数据。
**建议：** 同 H3。
**置信度：** 高
**优先级：** 中

### M7 — vault .bak 文件权限未限制

**位置：** `src/main/core/vault/file-vault-backend.ts:153`
**现象：** `write_vault` 写 `.bak` 用 `writeFile` 默认权限（0o644），不调 `set_file_permissions`。主 vault 文件和 vault.key 有权限限制，`.bak` 没有。
**影响：** 同一机器的其他用户可读取 `.bak`（包含与主 vault 相同的加密密钥数据）。
**建议：** 对 `.bak` 也执行 `set_file_permissions`。
**置信度：** 高
**优先级：** 中

### M8 — `index.ts` 中大量内联逻辑（~980 行），可读性和可测试性差

**位置：** `src/main/index.ts` 全文
**现象：** 入口文件包含窗口管理、tray、IPC handler 注册、scheduler 编排、OAuth 管理、config 回调等所有逻辑。虽部分已抽取（window-manager、config-callbacks），但主体仍是巨型 closure。
**影响：** 任何修改都需理解全局上下文；启动路径难以单元测试。
**建议：** 分阶段抽取：(1) tray 逻辑 → `tray-manager.ts`；(2) settings window 管理 → `settings-window.ts`；(3) 启动编排 → `bootstrap.ts`。
**置信度：** 高
**优先级：** 中（代码质量）

### M9 — OAuth manager 重复代码

**位置：** `src/main/core/auth/grok_oauth_manager.ts`（587 行）vs `kimi_oauth_manager.ts`（583 行）
**现象：** 两个文件约 80% 结构相同：token 存储/清除、device-code 轮询、auto-refresh 调度、retry 逻辑。差异仅在 OAuth 端点、client_id、request header 构建、generation 序列化（Grok 有，Kimi 无）。
**影响：** H1/H2 的 bug 源于复制时遗漏了 Grok 已修复的竞态保护。后续修复需同步两个文件。
**建议：** 抽取 `createOAuthManager<Deps>` 泛型工厂，差异通过 deps 注入。
**置信度：** 高
**优先级：** 中（代码质量 + 一致性）

### M10 — token-stats reader 工具函数重复

**位置：** `claude-reader.ts:247-255`、`kimi-reader.ts:90-98`、`opencode-reader.ts:119-124` 各自定义 `calendar_date_of`、`num`
**现象：** 三个 reader 文件重复定义 `calendar_date_of`、`num`、`extract_user_text`（claude/kimi）等辅助函数。
**影响：** 若需修改日期计算逻辑（如时区处理），需同步三处。
**建议：** 抽取到 `reader-utils.ts`。
**置信度：** 高
**优先级：** 低

### M11 — `isFiniteNonNegativeNumber` 类型谓词导致 `v` 隐式为 `number` 但实际赋值时类型不精确

**位置：** `src/main/ipc/size-validation.ts:20`
**现象：** `isFiniteNonNegativeNumberWithMax(v, max)` 返回 true 后 `v` 被 Narrow 为 `number`，但赋值 `result[field] = v` 时 `v` 的类型仍是 `unknown`（因 `v` 来自 `obj[field]`，类型谓词仅在 if 分支内生效）。
**影响：** 无运行时错误（值已通过校验）。TypeScript strict 模式下无问题。
**建议：** 无需修改。
**置信度：** 高
**优先级：** 无

---

## 改进建议

### S1 — `index.ts` 拆分

将 tray 逻辑（约 200 行）、settings window 管理（约 100 行）、启动编排分别抽为独立模块。降低入口文件认知负担。

### S2 — OAuth manager 抽象共享基类

Grok/Kimi 两个 OAuth manager 结构高度相似，建议抽取泛型工厂 `createOAuthManager<TEndpoints>`，通过端点配置 + header 构建器注入差异。确保竞态保护逻辑（generation、mutation queue、refresh dedup）统一实现，消除 H1/H2 类复制遗漏。

### S3 — token-stats reader 工具函数提取

将 `calendar_date_of`、`num`、`extract_user_text`、`truncate_title`、`message_id_from_line` 抽取到 `src/main/core/token-stats/reader-utils.ts`。

### S4 — local-api 默认绑定 127.0.0.1

`server.ts:472` 的 `listen(target_port, "0.0.0.0")` 改为 `listen(target_port, "127.0.0.1")`。若需局域网访问，提供显式配置项。

### S5 — config-store `enqueueSave` 的 inflightSaves 计数

当前 `saveTail = saveTail.then(() => { inflightSaves--; })` 在链末尾递减，但 `saveTail` 可能已被下一次 `enqueueSave` 覆盖。实际行为正确（闭包捕获的 `saveTail` 引用是当时的），但代码意图不够清晰。建议加注释或改用独立计数器。

---

## 不确定项

### U1 — `node:vm` sandbox 是否已有隔离替代方案？

代码注释提到 "moving to isolated-vm (D8)"，但未见相关 task 或 spike。需确认项目是否已规划迁移。当前正则检测作为深度防御已足够，但长期依赖 `node:vm` 面向用户脚本存在已知风险。

### U2 — `handleConfigGetSecrets` 仅从 setting route 访问的限制是否在 local-api 路径也生效？

`server.ts:366-372` 的 `/v1/secrets` GET 路径调用 `handleConfigGetSecrets`，但无 `assert_setting_route` 检查。Web 面板是否应有等效限制？需确认产品意图。

### U3 — observation-store 和 token-stats-store 共享同一 SQLite 文件

`paths.ts:46-55` 注释说明这是有意设计（better-sqlite3 支持同进程多连接）。若未来拆分，需同步更新两个 store 的路径。当前无问题。

### U4 — `Grok OAuth await_completion` 中 generation 检查的必要性

`grok_oauth_manager.ts:335-338` 在 `enqueue_token_mutation` 内检查 generation 是否过期。Kimi 版无此检查（也无 mutation 队列）。需确认：generation 检查是否仅为了防止并发登录覆盖，还是有更深层的安全需求。

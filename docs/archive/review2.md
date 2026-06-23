# OmniUsage 全仓库代码审阅报告

**审阅日期**: 2026-06-22
**审阅范围**: connectors/、src/main/core/、src/main/ipc/、src/preload/、src/renderer/、src/shared/、tests/、docs/、schemas/、配置文件
**审阅方式**: 多维度并行 sub agent 深度审阅
**验证日期**: 2026-06-22（逐条代码验证，修正不准确条目）

### 验证结果统计

- ✅ 正确：43 条
- ⚠️ 部分正确：10 条（已标注）
- ❌ 不成立：7 条（C2、C19、M12、M13、M17、M29、M30，已标注）
- 其中 M5 比原描述更严重（月份未加 1，不仅是补零问题）

---

## 一、严重问题（需立即修复）

### [C1] MiMo connector 错误处理逻辑缺陷

- **位置**: `connectors/mimo/connector.ts:112-118`
- **问题**: `detail_result` 在 catch 分支返回 `null`，随后判断 `detail_result?.code !== 0`。当 `detail_result` 为 `null` 时，`?.code` 是 `undefined`，`undefined !== 0` 为 `true`，会直接抛出异常。这意味着即使 usage 请求成功，只要 detail 请求失败/为空，整个 connector 就会报错返回空。
- **风险**: MiMo 账号数据频繁丢失，用户看到的永远是空数据或报错。

### [C2] ~~Codex 用量百分比反转 Bug~~（实际为正确行为）

- **位置**: `connectors/cpa/connector.ts:176`（`parse_codex`）
- **代码**: `const pct = raw_pct >= 100 ? 0 : raw_pct;`
- **结论**: **有意为之，非 bug**。Codex API 返回 `1.0`（即 100%）表示"未使用账户"，clamp 到 0 是正确行为。注释（第 165-166 行）已说明：`API returns 1.0 for unused accounts → to_pct = 100 → clamp to 0`。git commit `7b3a469` 是修复之前的真正反转 bug，当前代码是修复后的状态。

### [C3] 空实现与 manifest 声明的能力严重不匹配

- **Gemini**: `connectors/gemini/connector.ts` 为空（返回 `[]`），但 manifest 声明 `capabilities: ["poll"]` 并配置了带 auth 的轮询端点。系统会无意义轮询。
- **Antigravity**: `connectors/antigravity/connector.ts` 为空，但 manifest 声明 `capabilities: ["local"]` 并配置了本地路径。应用会尝试依赖不存在的本地数据抓取。
- **Kimi**: `connectors/kimi/connector.ts` 为空，但 manifest 声明 `capabilities: ["session"]`，用户配置了 Cookie 却得不到任何数据。
- **风险**: 用户配置了账号但永远看不到数据，无法区分"没数据"和"没配好"。

### [C4] preload 路由权限控制错误 — popup 被授予配置写权限

- **位置**: `src/preload/index.ts:220-274`
- **问题**: popup 路由被分配了 `config_full`（含 `save`/`saveSecrets`/`duplicate`/`export`/`import`），但 popup 窗口按设计应为只读。settings 路由拥有全部权限是合理的，popup 不应能修改全局配置。
- **风险**: XSS 或第三方脚本通过 popup 窗口篡改配置、导出敏感数据。

### [C5] tray 路由缺少 `auth` 方法且被类型断言掩盖

- **位置**: `src/preload/index.ts:240-255`
- **问题**: `tray` case 返回的对象没有 `auth` 属性，但通过 `as unknown as UsageboardApi` 强制断言。运行时调用 `window.usageboard.auth.cookieLogin()` 会崩溃。
- **风险**: tray 窗口触发登录流程时产生运行时异常。

### [C6] auth-ipc.ts 登录 URL 缺乏域名白名单验证

- **位置**: `src/main/ipc/auth-ipc.ts:29-33`
- **问题**: `handleCookieLogin` 从插件 manifest 读取 `loginUrl` 后直接 `loginWin.loadURL(loginUrl)`，未验证域名是否属于已知服务。
- **风险**: 恶意/篡改的插件 manifest 可导致主进程打开钓鱼网站，配合 `webRequest` 拦截窃取 Cookie。

### [C7] IPC 输入验证缺失导致主进程崩溃风险

- **位置**: `src/main/ipc/log-ipc.ts:9-40`
- **问题**: `handleRendererLog` 直接解构 `payload` 的 `level`/`module`/`message`，未验证类型。`createLogger(module.startsWith(...))` 在 `module` 非字符串时抛出 TypeError。
- **风险**: 恶意 renderer payload 导致主进程日志处理崩溃。

### [C8] session-ipc.ts `cookie_names` 未做运行时类型验证

- **位置**: `src/main/ipc/session-ipc.ts:16-18`
- **问题**: `if (!request.cookie_names.length)` 假设 `cookie_names` 是数组；若 renderer 绕过类型发送非数组，访问 `.length` 会抛出 TypeError。
- **风险**: 导致 IPC handler 异常，返回不明确的错误信息。

### [C9] Schema 与架构/术语严重脱节

- **位置**: `schemas/plugin-output.schema.json`、`schemas/plugin-metadata.schema.json`
- **问题**:
    - `source` enum 仍为旧值 `["cpa", "direct", "local", "api_key", "oauth"]`，与 glossary 和架构 v2 定义的 `poll`/`local`/`session`/`observe` 完全不符。
    - `provider` enum 缺少 `"brave"`（已完成接入）。
    - `plugin-output` 成功体仍要求旧字段 `updatedAt`，而 v2 统一为 `observedAt`。
    - `plugin-metadata` 的 `defaultSource` enum 仍是废弃的旧分类。
- **风险**: 对外 JSON Schema 契约与内部 Zod schema 及实现语义不一致，可能导致数据校验误报或第三方集成出错。

### [C10] `limit` / `reset_at` / `observed_at` 类型跨层不一致

- **位置**: `src/shared/schemas/plugin-output.ts` vs `src/shared/schemas/observation.ts`
- **问题**:
    - `limit`: `plugin-output` 中不可 null，`observation` 中 `nullable()`，流入时必崩。
    - `resetAt`: `plugin-output` 中为 `string.nullable().optional()`，`observation` 中为 `finite_number.nullable()`，number vs string 混用。
    - `observedAt`: `plugin-output` 中为 `string.optional()`，`observation` 中为 `finite_number`，类型完全不兼容。
    - `stale`: `plugin-output` 中为 `optional()`，`observation` 中为 `required`，optional 流入 required 路径会在校验时抛异常。
- **风险**: connector 输出经 observation ingest 后 schema 校验必崩，是数据流程的阻断性 bug。

### [C11] `config.ts` parameterValues 值类型写死为 `string`

- **位置**: `src/shared/types/config.ts:64`
- **问题**: `Readonly<Record<string, string>>`，但 manifest 支持 `number` 类型参数（如 CPA 的 `max_tokens`），传入数字时 TypeScript 报错，运行时也被强制当字符串处理。

### [C12] `electron-builder.yml` `runAsNode: true` 为遗留安全降级

- **位置**: `electron-builder.yml`
- **问题**: v2 架构已废弃 `spawn(process.execPath, ELECTRON_RUN_AS_NODE=1)` 子进程模型（改为 Node VM 沙箱），但 fuse 仍开启 `runAsNode: true`。这与架构 v2 安全边界矛盾。保留此 fuse 使打包产物可被注入任意 Node 脚本执行。

### [M50] scheduler 测试仅验证 DOM 可见性，未验证终端状态

- **位置**: `tests/user_e2e/specs/scheduler.spec.ts:27-42`
- **问题**: `plugins reach a terminal state` 仅等待 5 秒后检查卡片 DOM 可见性。没有断言任何终端状态（ready/failed/loading），也未处理 `count === 0` 路径，测试名承诺验证"终端状态"，实际只验证了"DOM 存在"。
    ```ts
    await page.waitForTimeout(5000);
    if (count > 0) {
        const firstCard = pluginCards.first();
        await expect(firstCard).toBeVisible();
    }
    ```

### [C19] ~~connector runtime: VM timeout 不限制异步执行~~（实际已覆盖）

- **位置**: `src/main/core/connector/runtime.ts:108-111`
- **结论**: **不成立**。review 漏看了第 111 行的 `race_with_timeout(Promise.resolve(raw_result), timeout_ms)`，异步 Promise 结果同样受时间限制。两层保护：`vm.runInContext` 的 timeout（同步 CPU）+ `race_with_timeout`（异步）。

### [C20] refresh-service: 锁无超时，永久卡死

- **位置**: `src/main/core/scheduler/refresh-service.ts:177-185`
- **问题**: `locks` 是内存 `Set`，如果 `execute_connector` 内部网络 hang（如未设置超时或代理无响应），该 instanceId 永远被锁定，后续所有手动/自动刷新都被跳过，直到进程重启。
- **风险**: 连接器永久失活。

### [C21] refresh-service: refreshAll 无并发限制

- **位置**: `src/main/core/scheduler/refresh-service.ts:308-321`
- **问题**: `Promise.allSettled(enabled_connectors.map(...))` 会同时发起所有启用连接器的请求。如果用户启用了 20 个连接器，同时发起 20 个 HTTP 请求。
- **风险**: 内存、句柄、目标服务器压力爆炸。

### [C22] net-client: chunked 响应可造成内存耗尽

- **位置**: `src/main/core/connector/net-client.ts:136-154`
- **问题**: `content-length` 检查缺失时（如 chunked transfer），`response.body.text()` 会在内存中积累完整响应体，之后才检查 `MAX_RESPONSE_BYTES`。恶意/异常大响应可在检查前耗尽内存。
- **风险**: OOM / 应用崩溃。

### [C23] main-panel-controller: 不安全的类型断言

- **位置**: `src/main/core/main-panel/main-panel-controller.ts:250`
- **问题**: `return (win as unknown as BrowserWindow | null) ?? null;` 将 `WindowLike`（Pick 的子集）硬转回 `BrowserWindow`。Electron 版本升级时如果 `WindowLike` 缺少真实 `BrowserWindow` 的必选属性，下游调用会运行时崩溃。

### [C24] config-store: schema 验证失败导致全部配置丢失

- **位置**: `src/main/core/config/config-store.ts:165-176`
- **问题**: 当 `appConfigurationSchema.safeParse` 失败时，直接回退到 `DEFAULT_CONFIGURATION`（空插件列表），且原文件虽被备份但应用不会自动恢复。
- **风险**: 用户配置全部消失，需手动从 .bak 恢复。

### [C25] file-vault-backend: vault 损坏 = 全部 secret 丢失

- **位置**: `src/main/core/vault/file-vault-backend.ts:111-120`
- **部分正确**: `JSON.parse` 失败时确实抛出 "possibly corrupted" 无恢复逻辑。但 ENOENT（文件不存在）有恢复逻辑（返回空对象）。损坏时的处理确实是问题——建议至少尝试从 `.bak` 恢复或返回空对象+警告。

---

## 二、中等问题

### [M1] CPA 参数冗余 — `monitor_deepseek` 无实际作用

- **位置**: `connectors/cpa/manifest.json:39-47`
- **问题**: 定义了 `monitor_deepseek` 开关参数，但 `connector.ts` 的 `fetch_provider` / `parse_provider` 中没有 `deepseek` 分支。

### [M2] CPA connector 使用 console.debug 违反规范

- **位置**: `connectors/cpa/connector.ts:130、249、347`
- **部分正确**: 确实有 `console.debug` 调用，但这些在 connector runtime（子进程沙箱）中运行，不会直接输出到主进程 console。仍属调试遗留，应清理，但实际影响比 review 暗示的小。

### [M3] GLM connector 死代码

- **位置**: `connectors/glm/connector.ts:107-110`
- **问题**: 第 107 行已 `throw`，第 110 行的 `if (!Array.isArray(limits)) return [];` 永远不可达。

### [M4] GLM connector window 映射不一致

- **位置**: `connectors/glm/connector.ts:134、157`
- **问题**: `text` 分支中 `month` period 的 window 被映射成 `"day"`，但 `tool` 分支中 `month` 被映射成 `"month"`。相同 period 在不同 kind 下给出不同 window。

### [M5] Codex connector 日期 key 格式严重错误

- **位置**: `connectors/codex/connector.ts:23-26`
- **问题**: `day_key` 中月份有两个严重错误：(1) `getUTCMonth()` 返回 0-indexed 月份，但代码未加 1，1 月生成 `"0"` 而非 `"1"`；(2) 月份不补零，生成 `2026-0-1`、`2026-11-1` 等字符串。按字典序排序时会产生 `2026-11-1 < 2026-2-1` 的错误。**比 review 最初描述更严重**——不仅是补零问题，月份本身就差了 1。

### [M6] MiniMax `reset_from_ms` 语义风险

- **位置**: `connectors/minimax/connector.ts:101-105`
- **问题**: `reset_from_ms` 将值解释为"剩余毫秒数"并加上 `Date.now()`。但字段名 `remains_time` 究竟是剩余毫秒还是 Unix 时间戳并不明确。如果 API 返回的是时间戳，则 `reset_at` 会变成错误时间。

### [M7] Tavily connector limit 为 0 时静默忽略

- **位置**: `connectors/tavily/connector.ts:63`
- **问题**: `if (plan_limit <= 0) return [];` 直接返回空数组。用户无法区分"没有 plan limit"和"没配好"。

### [M8] 大量 IPC handler 吞掉原始错误

- **位置**: `src/main/ipc/connector-ipc.ts`、`config-ipc.ts`、`session-ipc.ts` 多处
- **问题**: `catch { return fail("INTERNAL_ERROR", "固定消息") }` 丢失了原始 `error.message`，生产环境排查极其困难。

### [M9] config-ipc.ts `handleConfigSave` 存在潜在 race

- **位置**: `src/main/ipc/config-ipc.ts:96-132`
- **问题**: `current = await deps.configStore.load()` 与后续 save 之间，其他窗口可能已修改配置。合并逻辑会覆盖中间修改，多窗口同时保存时丢失数据。

### [M10] preload `invoke` 返回数据未做运行时验证

- **位置**: `src/preload/index.ts:30`
- **部分正确**: `return raw.data as T` 确实没有运行时验证，但 `is_ipc_result` 已做基本形状检查（`ok: boolean`）。这是 TypeScript 标准模式（编译时安全、运行时不验证），实际风险有限。

### [M11] `src/main/index.ts` tray IPC 使用字符串字面量而非常量

- **位置**: `src/main/index.ts:457、505-506、522-587`
- **问题**: 大量 `tray:*` 通道使用硬编码字符串，与 `IPC_CHANNELS` 常量定义不一致，增加拼写错误和维护成本。

### [M12] ProviderCard.tsx — 厂商名称可能显示 undefined

- **位置**: `src/renderer/components/ProviderCard.tsx:80`
- **结论**: **不成立**。`PROVIDER_LABELS` 类型是 `Record<UsageProvider, string>`，`provider` 类型是 `UsageProvider`，TypeScript 编译器保证所有 key 都有值。除非运行时传入非 `UsageProvider` 值（被编译器阻止），label 不会为 `undefined`。

### [M13] SettingsView.tsx — VendorCard 传入 provider="unknown"

- **位置**: `src/renderer/views/SettingsView.tsx:1305`
- **结论**: **不成立**。`"unknown"` 只用作分组 key（`provider_id`），不会作为 vendor name 渲染到 UI。`get_vendor_name("unknown")` 不会被调用，图标与文字不匹配的情况不会出现。

### [M14] 缺少 antigravity 在 ADD_COMMON_SERVICES

- **位置**: `src/renderer/lib/common-services.ts`
- **问题**: `ADD_COMMON_SERVICES` 列表包含 claude, codex, gemini, glm, kimi, deepseek, tavily, mimo，但**缺少 antigravity**。设置页添加账号时不会显示 antigravity 选项。

### [M15] `docs/SPEC.md` 大量内容过时

- **位置**: `docs/SPEC.md`
- **部分正确**: §3.2 确实过时——仍描述旧"脚本头部 80 行注释块" metadata 格式（`UsageBoardPlugin:` markers），当前代码已改用 `manifest.json` + Zod schema。但 §3.4 的 plugin output schema **仍然有效**——它描述的是 plugin stdout 格式（`schemaVersion: 2`），与 `Observation` 类型是不同系统（plugin 输出 vs 内部 observation store），不存在"被 Observation 替代"的说法。

### [M16] `docs/TEST.md` 覆盖率阈值与 vitest 配置严重不一致

| 指标       | TEST.md | vitest.config.mts |
| ---------- | ------- | ----------------- |
| Statements | **1%**  | **15%**           |
| Branches   | **22%** | **25%**           |
| Functions  | **20%** | **25%**           |
| Lines      | **1%**  | **15%**           |

### [M17] `logger.ts` serialize_meta 误标非循环共享对象

- **位置**: `src/shared/lib/logger.ts:105`
- **结论**: **不成立**。`seen` 是 `WeakSet`，每次调用 `serialize_meta` 重新创建（第 92 行），且 `finally` 块（第 126 行）执行 `seen.delete(value)`。非循环共享对象在第一次出现时被序列化，然后从 `seen` 移除，第二次引用时会正常再次序列化。只有真正的循环引用（A→B→A）才会被捕获——内层引用在 `finally` delete 之前命中 `seen.has(value)`。这是正确行为。

### [M18] `config_redaction.ts` `/key/i` 模式过于宽泛

- **位置**: `src/shared/lib/config_redaction.ts`
- **问题**: `keywords`、`monkey` 等合法字段会被误脱敏。建议加词边界或后缀约束。

### [M19] manifest.ts 缺少 `.strict()`

- **位置**: `src/shared/schemas/manifest.ts`
- **问题**: Zod schema 允许额外字段，版本升级时 typo 字段静默丢弃。

### [M20] 安全扫描在 CI 中未完整执行

- **位置**: `.github/workflows/ci.yml`
- **问题**: `package.json` 定义了 `security:sast`（semgrep），但 CI 仅调用 gitleaks，未执行 semgrep。SAST 规则在 CI 中缺失。

### [M21] CI 未覆盖打包 smoke 测试

- **位置**: `.github/workflows/ci.yml`
- **问题**: e2e job 执行 `pnpm package` 和 `pnpm test:e2e`，但未跑 `pnpm test:packaged`。根据 `docs/TEST.md` §3.2，打包产物可用性必须自动化覆盖。

### [M22] CI 缺少多平台矩阵

- **位置**: `.github/workflows/ci.yml`、`.github/workflows/nightly.yml`
- **问题**: 均只用 `ubuntu-latest`。Electron 应用打包目标含 Windows/macOS/Linux，Win32 特有的 ABI 切换脚本、托盘行为、路径处理无法在 Ubuntu CI 中验证。

### [M23] 依赖冗余或位置不当

- `zod-to-json-schema` 在 `dependencies`，仅 `scripts/export-schemas.ts` 使用，应移至 `devDependencies`。
- `eslint-plugin-import` 已安装但 `eslint.config.ts` 仅使用 `eslint-plugin-import-x`，前者冗余。
- `esbuild` 在 `dependencies`，项目未直接调用（由 `electron-vite` 间接依赖）。

### [M24] ESLint 配置未启用已安装插件

- **位置**: `eslint.config.ts`
- **问题**: 安装了 `eslint-plugin-security`、`eslint-plugin-sonarjs`、`eslint-plugin-jsx-a11y`，但配置未引入其推荐规则。

### [M28] connector-scheduler: setInterval 堆积

- **位置**: `src/main/core/scheduler/connector-scheduler.ts:33-35`
- **问题**: 如果 `deps.refresh` 执行时间超过 interval，后续调用会排队堆积（虽然 refresh-service 有锁会跳过，但日志和调度器状态会混乱）。建议改用 `setTimeout` 链式调用。

### [M29] scheduler-orchestrator: suspend/resume 竞态

- **位置**: `src/main/core/scheduler/scheduler-orchestrator.ts:72-101`
- **结论**: **不成立**。generation guard 实现正确：`suspend` 递增 generation（第 75 行），`resume` 在异步 `configStore.load()` 前捕获 generation（第 87 行），完成后比对（第 91 行）。JavaScript 单线程也防止了并发 resume 竞态。如果 suspend/resume 快速交替，generation mismatch 会正确跳过过时的 startAll。

### [M30] refresh-service: 空 observations 导致 loading 状态挂起

- **位置**: `src/main/core/scheduler/refresh-service.ts:210-242`
- **结论**: **不成立**。空 observations 时代码仍然执行 `deps.runtimeStore.updateState(instanceId, { status: "ready", items: [] })`（第 231-242 行），connector 转为 `ready` 而非卡在 `loading`。`items` 为空数组但状态正确更新。

### [M31] refresh-service: auto re-login 只有一次重试，无退避

- **位置**: `src/main/core/scheduler/refresh-service.ts:251-295`
- **问题**: session 连接器在 401 时自动重登，但立即重试。如果目标服务短暂不可用，这次重试几乎必然失败。

### [M32] connector runtime: deep_freeze 循环引用栈溢出

- **位置**: `src/main/core/connector/runtime.ts:18-26`
- **问题**: `deep_freeze` 递归遍历对象值，如果 `ctx` 中存在循环引用，将抛 `RangeError: Maximum call stack size exceeded`。

### [M33] net-client: 文件读取未检查符号链接

- **位置**: `src/main/core/connector/net-client.ts:217-232`
- **问题**: `is_within_allowed` 使用 `resolve()` 解析路径，但 `readFile` 前未检查目标文件本身是否为符号链接。攻击者可在 allowed 目录内放置指向 `/etc/passwd` 的 symlink。

### [M34] observation-store: WAL 无 checkpoint 限制

- **位置**: `src/main/core/observation/observation-store.ts:83`
- **问题**: 使用 WAL 模式但未设置 `wal_autocheckpoint`，在写入频繁时 `-wal` 文件可能无限增长。

### [M35] observation-store: 同步 API 阻塞主线程

- **位置**: `src/main/core/observation/observation-store.ts:82`
- **问题**: `better-sqlite3` 是同步的。`insert`、`prune` 等操作在主线程执行，大数据量 pruning 时会冻结 UI。

### [M36] local-api: 错误静默

- **位置**: `src/main/core/local-api/server.ts:125-127`
- **问题**: `handle_request` 的 catch 只返回 500，不记录任何日志。调试生产环境问题时无法定位。

### [M37] logging: 无日志大小限制

- **位置**: `src/main/core/logging.ts`
- **问题**: 单天日志文件无大小上限，长期运行（或开启 debug 后）可能产生 GB 级日志。

### [M38] config-store: 启动时插件 healthy 检查阻塞

- **位置**: `src/main/core/config/config-store.ts:47-68`
- **问题**: `load()` 时对每个插件并行读取文件系统判断 `is_plugin_healthy`，如果插件数量多（>50），启动 I/O 压力大。

### [M39] config types: 多个可选字段无边界

- **位置**: `src/main/core/config/types.ts`
- **问题**: `cacheMaxMb` 只有 `.positive()` 无上限，`providerLabelMaps` 等嵌套对象无深度限制。用户导入恶意大配置可能导致内存问题。

### [M40] 测试 — 纯常量自测，未调用任何源码函数

- **位置**: `tests/unit/main/tray_menu.test.ts:10-73`
- **问题**: 测试体内直接声明 `zh_labels`/`en_labels`/`IPC_CHANNELS` 三个字面量，然后断言它们的内容。没有任何 `import` 自源码模块的函数被调用，属于"测试空气"，对回归零防护价值。

### [M41] 测试 — 空壳测试与名称承诺不符

- **位置**: `tests/user_e2e/specs/tray_menu_actions.spec.ts:50-58`
- **问题**: `quit command is available` 仅断言 `await page.title()` 为真值，完全没有验证 quit 菜单项存在或行为。

### [M42] 测试 — 未验证 warning

- **位置**: `tests/integration/connector/runtime.test.ts:112-117`
- **问题**: `filters out malformed observations with warning` 只断言 `observations` 为空数组，但未断言 warning 被记录。

### [M43] 测试 — alert class 覆盖不完整

- **位置**: `tests/unit/renderer/components/provider_card.test.tsx:712-758`
- **问题**: 四个 `alert` class 测试全部 assert `false`，但从未测试 alert class **应当出现**的场景。只测了"不出现"，没测"出现"。

### [M44] 测试 — debounce 逻辑未真正验证

- **位置**: `tests/user_e2e/specs/popup_height_debounce.spec.ts:21-39`
- **问题**: 标题承诺验证"rapid collapse and expand leaves popup usable"，但只点了折叠/展开按钮再检查元素可见，未测量 popup 高度变化或验证 debounce 逻辑本身。

### [M45] 测试 — 明文 secret 日志测试固化不安全行为

- **位置**: `tests/unit/shared/logger.test.ts:10-35`
- **问题**: `logs raw message and metadata values in debug mode` 断言原始 secret（`api_key=secret-token`、`Bearer real-token`）出现在日志输出中。测试在固化一个不希望长期保持的明文日志行为。

### [M46] 测试 — interval 钳制未验证

- **位置**: `tests/integration/scheduler/connector-scheduler.test.ts:43-48`
- **问题**: `enforces minimum interval of 5 seconds` 仅断言 `refresh` 被调用一次，未验证 interval 是否被钳制到 5s，也未检查后续 tick 的时间间隔。

### [M47] 测试 — schema 复杂 fixtures 未覆盖

- **位置**: `tests/unit/shared/schemas.test.ts:103-127`
- **问题**: `pluginMetadataSchema` 测试仅覆盖 `metadata-basic.ts` 一个 fixture。其他 fixtures（`metadata-invalid-json.ts`、`metadata-missing-end-marker.ts` 等）没有任何测试。

### [M48] 测试 — popup height controller 场景缺失

- **位置**: `tests/unit/main/popup_height_controller.test.ts:90-142`
- **问题**: `apply_locked_size` 未覆盖 Windows 下 `tray_bounds: null && user_moved: true` 的场景。

### [M49] 测试 — POC 与真实架构脱节

- **位置**: `tests/poc/sandbox-poc.test.ts`
- **问题**: 仍使用 `node:vm`，但当前 connector runtime 实际生产代码已不使用此沙箱。该 POC 与真实架构已脱节。

### [M27] `errors/connector-errors.ts` 缺少结构化错误码

- **位置**: `src/shared/errors/connector-errors.ts`
- **问题**: 仅四个异常类，没有错误码枚举。上游无法可靠区分 "超时" vs "进程 killed" vs "schema 失败"。

---

## 三、低优先级问题

### [L1] 大量辅助函数在 connector 间重复

- `is_record`、`to_number`、`status_for_*`、`parse_limit` 等函数在多个 connector 中重复定义。
- 根因: connector runtime（`runtime.ts:compile_script`）明确禁止 import/export，无法共享模块。
- 建议: 如需减少重复，需先扩展 runtime 支持内联工具库或预处理 bundling。

### [L2] MiMo connector 硬编码 Chrome UA

- **位置**: `connectors/mimo/connector.ts:71-84`
- **问题**: 硬编码了具体 Chrome 版本号（`149.0.0.0`），长期维护可能过期。

### [L3] 列表项组件均缺少 React.memo 优化

- **位置**: `ProviderCard`、`ProviderAccountRow`、`UsageBarRow` 等
- **问题**: 纯展示组件未包裹 `memo`，在拖拽排序、刷新状态变化等场景下会导致整棵树不必要的重渲染。

### [L4] PopupView.tsx 多处可缓存计算未缓存

- `derive_status_bar`（`PopupView.tsx:658`）：每次 render 遍历所有 plugins，可用 `useMemo` 缓存。
- `refresh_providers` Set（`PopupView.tsx:915`）：`useMemo` 意义有限，因为依赖变化必触发重渲染。

### [L5] ProviderCard.tsx — 拖拽 onDragStart 触发两次

- **位置**: `ProviderCard.tsx:186-189` 和 `:296-298`
- **问题**: DragGrip 的 `onMouseDown` 和 `div` 的 `onDragStart` 都调用 `onDragStart(provider)`，逻辑上会触发两次。

### [L6] provider-usage.ts — accountKeyForPeriod 分隔符风险

- **位置**: `src/renderer/lib/provider-usage.ts:131-136`
- **问题**: 使用 `:` 分隔符构建 key。如果 `accountLabel` 包含 `:`，可能导致 key 解析歧义。

### [L7] AddAccountDialog.tsx — 手动选择文件按钮无功能

- **位置**: `src/renderer/components/AddAccountDialog.tsx:354-356`
- **问题**: `<button className="scan-manual" type="button">` 的 `onClick` 未绑定任何处理函数。

### [L8] Icon.tsx — VendorMark id 类型过于宽泛

- **位置**: `src/renderer/components/Icon.tsx:157`
- **问题**: `id: string` 丢失了编译时检查，应考虑用更精确的类型（如 `UsageProvider | "overview" | "cpa"`）。

### [L9] `size-validation.ts` 未限制数值上限

- **位置**: `src/main/ipc/size-validation.ts:5-18`
- **问题**: `isFinitePositiveNumber` 只检查 `>= 0`，未设置合理上限（如窗口大小不应超过 10000px）。

### [L10] `is_ipc_result` 类型守卫过于宽松

- **位置**: `src/preload/index.ts:13-19`
- **问题**: 只检查 `ok` 是否为布尔值，不验证 `error.code`/`error.message` 是否为字符串。

### [L11] `SETTINGS_MINIMIZE`/`MAXIMIZE`/`CLOSE` 使用 `send` 而非 `invoke`

- **位置**: `src/preload/index.ts:148-155`
- **问题**: 单向 `send` 无返回值，调用方无法确认操作结果，错误时静默失败。

### [L12] `event-ipc.ts` 的 catch 块只是重新 throw

- **位置**: `src/main/ipc/event-ipc.ts:43-45`、`63-65`
- **问题**: 异常被捕获记录后又抛出，未提供更有意义的错误封装。

### [L13] `helpers.ts` `assert_valid_sender` 仅做基础源检查

- **位置**: `src/main/ipc/helpers.ts:15-20`
- **问题**: 只拒绝 `about:blank` 和空 URL，未限制生产环境应为 `file://` 协议。

### [L14] 常量重复定义，未统一消费

- `DEFAULT_TIMEOUT_MS = 15_000` 定义在 `constants.ts`，但 `session-manager.ts` 自行定义 `120_000`，`runtime.ts` 自行定义 `15_000`。

### [L15] `ipc.ts` `UsageboardApi` 混用废弃命名

- **位置**: `src/shared/types/ipc.ts`
- **问题**: 同时暴露 `connector` 和 `plugin`（deprecated），建议彻底移除或标记完整 JSDoc。

### [L16] `plugin-output.ts` 类型命名未遵循 snake_case

- **位置**: `src/shared/schemas/plugin-output.ts`
- **问题**: `UsageProvider`、`MetricRecord` 等用 PascalCase，项目规范要求 snake_case。

### [L17] `logger.ts` scrub_meta 用 JSON round-trip

- **位置**: `src/shared/lib/logger.ts`
- **问题**: `Date`、`Map`、`Set` 等被 `serialize_meta` 保真后，又在 `scrub_meta` 里经 JSON.stringify/parse 打回。可在 `serialize_meta` 后直接对字符串 scrub。

### [L18] `observation_ingest_schema` 冗余 extend

- **位置**: `src/shared/schemas/observation.ts:44-52`
- **问题**: 先 `omit({ source })` 再 `extend({ source })`，无意义，应直接 `omit({ observed_at, stale, last_error })`。

### [L20] refresh-service: updated_at 在空 observations 时无意义

- **位置**: `src/main/core/scheduler/refresh-service.ts:234-237`
- **问题**: `observations.reduce` 在空数组时返回初始值 `Date.now()`，与 `items = []` 组合，会产生"刚刚更新但无数据"的矛盾状态。

### [L21] refresh-service: build_params 明文 fallback 可能泄露

- **位置**: `src/main/core/scheduler/refresh-service.ts:126-127`
- **问题**: secret 类型参数如果 `configured !== ""` 会直接放入 params 传给脚本。日志可能记录 params。建议: 在日志中显式 redact secret 参数。

### [L22] probe-executor: header 检测启发式脆弱

- **位置**: `src/main/core/connector/probe-executor.ts:25-41`
- **问题**: `detect_metric_type` 靠子字符串匹配 header 名，可能误判（如 `x-ratelimit-remaining` 和 `x-remaining-requests` 都匹配 "remaining"）。

### [L23] tier1-poll-executor: 不检查 HTTP 错误码

- **位置**: `src/main/core/connector/tier1-poll-executor.ts:40-51`
- **问题**: 通过 `ctx.http.get_json` 获取数据，但 `get_json` 在 4xx/5xx 时会抛错。如果 API 返回 200 但错误 JSON（如 Cloudflare 拦截页），`resolve_json_path` 会在 HTML 字符串上解析路径，返回 undefined，导致 used/limit 均为 null，最终返回空数组。这不算失败，而是静默无数据。

### [L24] tier1-poll-executor: JSON path 功能极弱

- **位置**: `src/main/core/connector/tier1-poll-executor.ts:8-17`
- **问题**: 只支持 `$.a.b.c`，不支持数组索引、通配符、过滤表达式。部分 API 返回数组结构时无法配置。

### [L25] main-panel-controller: suppress_bounds_save 竞态

- **位置**: `src/main/core/main-panel/main-panel-controller.ts:84-88`
- **问题**: `setBounds` 后通过 `setImmediate` 重置标志。如果 resize 事件在 setImmediate 回调前再次触发，第二次的 save 仍会被 suppress。建议: 用引用计数或 generation 替代布尔标志。

### [L26] storage write-json: 崩溃后 .tmp 残留

- **位置**: `src/main/core/storage/write-json.ts`
- **问题**: 原子写入过程中进程崩溃会留下 `.tmp` 文件，不会自动清理。建议: 启动时清理用户数据目录下的 `*.tmp`。

### [L27] vault: Windows 权限设置 fallback 无告警

- **位置**: `src/main/core/vault/file-vault-backend.ts:39-62`
- **问题**: `icacls` 失败时只 warn，vault.key 和 secrets.vault 可能保持默认权限（任何用户可读）。建议: 提升为 error，引导用户修复。

### [L28] vault: list_keys/get 无锁

- **位置**: `src/main/core/vault/file-vault-backend.ts:163-173`
- **问题**: `has` 和 `list_keys` 在 `read_vault` 时没有加 `with_lock`，理论上可能与并发 `set` 产生竞态（读到半写状态）。实际风险低（Node.js 单线程 + writeFile 原子性）。

### [L29] local-api: token 在 get_token 中明文暴露

- **位置**: `src/main/core/local-api/server.ts:187-189`
- **问题**: `get_token()` 返回明文 token，调用方可能误记录到日志。这是设计需要，但应在使用处 redact。

### [L30] manifest-loader: 目录遍历吞掉所有错误

- **位置**: `src/main/core/connector/manifest-loader.ts:42-63`
- **问题**: `try { ... } catch {}` 完全吞掉 `readdir` 异常，如果内置目录权限错误，用户完全无感知。建议: 至少 log.error。

### [L31] TypeScript: 大量 as unknown 断言

- **位置**: 分散在多个文件（runtime.ts, refresh-service.ts, local-api/server.ts 等）
- **问题**: 这些断言降低了类型安全，特别是外部输入（JSON parse、Zod parse 结果）的转换处。建议: 使用 branded types 或更精确的 Zod 推导。

### [L32] logging: 生产环境 console 被移除但 file transport 仍可能同步

- **位置**: `src/main/core/logging.ts`
- **问题**: `appendFile` 是异步但底层 I/O 可能排队，高并发日志时仍可能影响性能。建议: 使用流式写入或批量缓冲。

### [L33] hydrate-runtime-store: 仅恢复 manualRefreshOnly 连接器

- **位置**: `src/main/core/scheduler/hydrate-runtime-store.ts:45-75`
- **问题**: 启动时只从数据库恢复标记为 `manualRefreshOnly` 的连接器状态。自动刷新的连接器重启后 UI 显示为空，直到第一次调度完成。这是设计选择，但用户体验上有"启动后空白"问题。

### [L34] 测试 — schema 测试仅做最小检查

- **位置**: `tests/unit/shared/schemas.test.ts:14-48`
- **问题**: schema 测试名为 `accepts success-basic.json`，但仅断言 `result.success` 为 true，未进一步验证解析后的数据结构（如 items 数组结构、字段类型）。

### [L35] 测试 — 依赖实现细节的引用断言

- **位置**: `tests/unit/renderer/hooks/use_config.test.ts:116-160`
- **问题**: `does not re-update when echo of own save arrives` 直接比较对象引用（`toBe`）。该断言依赖 hook 内部恰好使用同一引用，如果未来引入 immer 或展开运算符做浅拷贝，测试会因实现细节变化而失效。

### [L36] 测试 — secret 传递未直接验证

- **位置**: `tests/user_e2e/specs/secrets_persistence.spec.ts:111-126`
- **问题**: `saved secret is passed to the plugin subprocess on refresh` 未直接验证子进程 stdout/stderr 或环境变量是否包含 secret，仅通过 UI 行为间接推断。由于 fake plugin 可能返回固定数据，无法证明 secret 真的被传递。

### [L37] 测试 — probe-executor 测试描述与实现不符

- **位置**: `tests/integration/connector/probe-executor.test.ts:225-237`
- **问题**: `uses first numeric header as used when no pattern match` 描述与实现不符。测试给的是 `x-custom-count`，但 `/probe` 端点未返回该 header，所以实际断言的是"header 不存在时返回空数组"，而非"使用第一个数字 header"。

---

## 四、已知历史问题

以下问题在已有文档中记录，需确认是否已修复：

1. **ABI 切换脚本路径转义问题**（`scripts/ensure_electron_abi.mjs:55`）—— `review-20260614-20260615.md` 已记录。
2. **ProviderCard/ProviderAccountRow 中 CPA 逻辑影响非 CPA 账号显示**——上一个 session 中已部分修复（git status 显示 `ProviderCard.tsx` 仍有修改），需确认完整修复。

---

## 五、优先修复建议

1. **立即修复**：[C1] MiMo 错误处理、[C3] 空实现 manifest 不匹配、[M5] Codex 日期 key（月份差 1 且未补零）
2. **本周修复**：[C4-C8] IPC 安全与验证问题、[C9-C11] Schema 不一致
3. **本月修复**：[C12] 安全 fuse、[M1-M4] Connector 中等问题
4. **持续改进**：[M8] 错误保留、[M9] 竞态、[L1] 代码重复、[M15-M16] 文档同步

> **已排除的问题**（经验证不成立）：C2（Codex 百分比是有意 clamp）、C19（race_with_timeout 已覆盖异步）、M12（TS 保证完整性）、M13（仅用作分组 key）、M17（WeakSet + delete 实现正确）、M29（generation guard 正确）、M30（空 observations 仍转为 ready）

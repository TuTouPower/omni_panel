# Review: shared / preload / web / generated

- **当前模型判断依据**：default_sonnet（继承主会话）
- **模块 slug**：shared
- **审阅范围**：`src/shared/`（16 文件）、`src/preload/`（4 文件）、`src/web/`（2 文件）、`src/generated/`（1 文件），共 23 个 .ts/.tsx 文件，全量审阅。
- **审阅时间**：2026-07-26

---

## 高优先级

### H1. popup 路由暴露了 `config.save`

- **位置**：`src/preload/index.ts:488-489`
- **现象**：`default`（popup）分支中 `config` 对象直接引用了 `config_full.save`，而其余写操作均替换为 no-op stub。popup 窗口设计为只读配置视图，不应持有写权限。
- **影响**：若 popup 窗口的 UI 代码误调 `config.save`，会实际写入配置文件，绕过 settings-only 的安全边界。
- **建议**：将 `save` 也替换为 `async () => { /* no-op */ }`，与 tray 路由保持一致。
- **置信度**：高
- **优先级**：高

### H2. web `session` 返回类型与接口不匹配

- **位置**：`src/web/usageboard-web.ts:140-142`
- **现象**：`SessionLoginResult` 接口定义为 `{ saved: boolean; cookie?: string }`，但 web 实现返回 `{ ok: false, error: "not supported on web" }`。由于 `as unknown as UsageboardApi` 强转，编译器不会报错。
- **影响**：调用方按 `SessionLoginResult` 类型解构 `saved` 字段时得到 `undefined`，逻辑判断失效。
- **建议**：返回 `{ saved: false }` 匹配接口契约，或将 web 端 `session` 接口改为 `Promise.reject` 阻断调用。
- **置信度**：高
- **优先级**：高

### H3. web `UsageboardApi` 大面积类型强转掩盖缺失成员

- **位置**：`src/web/usageboard-web.ts:185`
- **现象**：`create_web_usageboard()` 返回的 `api` 对象缺少多个接口成员：`connector.catalog`、`config.duplicate`、`config.createInstance`、`settings.openConnectorsDir`、`kimi`（完全缺失）、`buildInfo`（完全缺失）。最终以 `as unknown as UsageboardApi` 强转通过编译。
- **影响**：web 路由下调用缺失方法会抛 runtime TypeError，且编译期无法捕获。
- **建议**：逐一补齐缺失成员（默认 noop/空值），或为 web 场景定义精简接口 `WebUsageboardApi`，避免 unsafe cast。
- **置信度**：高
- **优先级**：高

---

## 中低优先级

### M1. `observation_schema` 的 `cycleDurationMs` 缺少 `nonnegative` 约束

- **位置**：`src/shared/schemas/observation.ts:38`
- **现象**：schema 使用 `finite_number.nullable().optional()`，允许负值。但 TypeScript 类型注释要求 `>= 0`，`plugin-output.ts` 的 schema 已用 `finiteNumber.nonnegative()`。
- **影响**：外部输入可传入负 `cycleDurationMs` 通过 schema 校验，下游进度条计算异常。
- **建议**：改为 `finite_number.nonnegative().nullable().optional()`。
- **置信度**：高
- **优先级**：中

### M2. `LogLevel` 类型重复定义

- **位置**：`src/shared/types/config.ts:12` 与 `src/shared/lib/logger.ts:1`
- **现象**：两处各自定义 `LogLevel = "debug" | "info" | "warn" | "error"`。若一处修改，另一处不同步则产生类型不一致。
- **影响**：维护负担；若未来新增 log level 易遗漏。
- **建议**：`config.ts` 改为 `import type { LogLevel } from "../lib/logger"` 或抽取到独立常量文件。
- **置信度**：高
- **优先级**：中

### M3. web 端 `log` 未经 throttle 和 sanitize

- **位置**：`src/web/usageboard-web.ts:153-154`
- **现象**：web build 的 `log` 方法直接 `console.debug("[usageboard]", payload)`，无频率限制、无字段长度截断、无控制字符过滤。preload 端有完整的 throttle + sanitize 管线。
- **影响**：高频日志可在 web 控制台刷屏；恶意/异常长消息未截断。
- **建议**：复用 `create_renderer_log_throttle` 和 `sanitize_log_field`，或提取共享 sanitize 函数。
- **置信度**：高
- **优先级**：中

### M4. web 端 `session` 和 `config` 参数类型为 `unknown`

- **位置**：`src/web/usageboard-web.ts:82-83`、`src/web/usageboard-web.ts:87-88`
- **现象**：`config.save(config: unknown)` 和 `config.saveSecrets(payload: unknown)` 接受 `unknown`，直接 `JSON.stringify` 发送到服务端，无运行时校验。
- **影响**：畸形数据直达服务端；preload 端有 IPC 层 + handler 校验兜底，web 端没有。
- **建议**：添加 `AppConfiguration` / `ConfigSaveSecretsPayload` 类型注解，或在 `post_json` 前做 zod parse。
- **置信度**：高
- **优先级**：中

### M5. web 端 EventSource 未关闭

- **位置**：`src/web/usageboard-web.ts:42-58`
- **现象**：`events_source` 创建后未注册 `beforeunload` 或组件卸载时的 `close()` 调用。React StrictMode 下 effect 双重执行也可能创建多个 EventSource。
- **影响**：页面导航或热重载时 SSE 连接泄漏。
- **建议**：提供 `dispose()` 方法并在页面 `beforeunload` 时调用 `events_source.close()`。
- **置信度**：高
- **优先级**：中

### M6. `scrubber` 注册值无上限淘汰策略

- **位置**：`src/shared/lib/logger.ts:25-26`、`src/shared/lib/logger.ts:42-47`
- **现象**：`MAX_SCRUB_VALUES = 10000`，超限后 `register()` 静默丢弃，无日志、无淘汰。`unregister()` 存在但无调用方。
- **影响**：长时间运行进程中，若注册值持续增长，达到 10000 后新密钥不再被 scrub，日志泄漏敏感数据。
- **建议**：达到上限时输出 warn 日志；考虑 LRU 淘汰或定期清理。
- **置信度**：中
- **优先级**：中

### M7. 密钥 pattern 重复维护

- **位置**：`src/shared/lib/logger.ts:23-24`、`src/shared/lib/config_redaction.ts:2-16`
- **现象**：`logger.ts` 的 `SECRET_KEY_PATTERN` 与 `config_redaction.ts` 的 `SECRET_KEY_PATTERNS` 列表部分重叠但不完全一致。两处各自维护密钥关键词匹配规则。
- **影响**：新增密钥模式时易遗漏一处，导致部分场景脱敏不全。
- **建议**：抽取共享 `secret_patterns.ts`，两处引用同一源。
- **置信度**：高
- **优先级**：中

### L1. `providerLabelMaps` 硬编码 `[redacted]` 字符串

- **位置**：`src/shared/lib/config_redaction.ts:48`
- **现象**：其他字段统一用 `REDACTED_VALUE = "***"`，唯独 `providerLabelMaps` 用 `"[redacted]"`。
- **影响**：日志/导出中脱敏标记不一致，下游解析或人工排查时产生混淆。
- **建议**：统一使用 `REDACTED_VALUE` 常量。
- **置信度**：高
- **优先级**：低

### L2. web 端 platform 硬编码 `"win32"`

- **位置**：`src/web/usageboard-web.ts:62`
- **现象**：web build 始终报告 `platform: "win32"`，不反映实际服务器平台。
- **影响**：macOS/Linux 服务器部署时，UI 渲染可能应用 Windows 特定样式（如 titlebar drag 区域）。
- **建议**：从 `/v1/status` 或 build info 获取真实平台，或使用 `"web"` 专用值。
- **置信度**：中
- **优先级**：低

### L3. `createTraceId` 使用 `Math.random()`

- **位置**：`src/shared/lib/logger.ts:274-276`
- **现象**：trace ID 由 `Date.now().toString(36)` + `Math.random().toString(36).slice(2,8)` 生成，熵仅约 24 bit，可预测。
- **影响**：仅用于日志关联，无安全风险，但在高并发下碰撞概率不可忽略。
- **建议**：如需更高唯一性，可用 `crypto.randomUUID()` 或 `crypto.getRandomValues()`。
- **置信度**：高
- **优先级**：低

### L4. `poll_map_schema` superRefine 只校验三个字段

- **位置**：`src/shared/schemas/manifest.ts:46-55`
- **现象**：仅对 `used`、`limit`、`remaining` 强制 JSON path（`$` 前缀）。若未来 map 新增数值字段（如 `reset_at`），未经校验会静默返回字面值。
- **影响**：新 map 字段误配为字面字符串时，`resolve_json_path` 返回原值，被误当成合法数值。
- **建议**：改为白名单方式——非 `$` 前缀的值仅允许 `window` 等已知枚举字段。
- **置信度**：中
- **优先级**：低

### L5. `TrendPoint` 类型在两处重复定义

- **位置**：`src/shared/lib/trend.ts:3-6`、`src/shared/types/ipc.ts:262-265`
- **现象**：`trend.ts` 和 `ipc.ts` 各自定义了结构相同的 `TrendPoint`。
- **影响**：修改一处时另一处不同步会导致类型不兼容。
- **建议**：`ipc.ts` 从 `trend.ts` 导入，或抽取到 `types/` 统一管理。
- **置信度**：高
- **优先级**：低

### L6. `pluginEndpointsSchema` 允许 null URL

- **位置**：`src/shared/schemas/plugin-metadata.ts:44`
- **现象**：`z.record(z.string().url().nullable())` 允许 endpoint 值为 null。但 `manifest.ts` 的 `endpoints` 字段为 `z.record(z.string(), z.string().url())` 不允许 null。两处对 endpoints 的语义不一致。
- **影响**：metadata 校验通过但 manifest 校验拒绝同一数据，connector 作者困惑。
- **建议**：统一 endpoint nullability 语义。
- **置信度**：高
- **优先级**：低

---

## 改进建议

1. **web API 契约**：当前 `as unknown as UsageboardApi` 是全量缺失的遮羞布。建议定义 `WebUsageboardApi extends Partial<UsageboardApi>` 或用 Proxy 在缺失方法上抛出明确的 `UnsupportedOperationError`，让 web-only 的 bug 在开发期暴露。
2. **路由分权可测试性**：`preload/index.ts` 的 switch-case 构建了三套 API 对象，逻辑量大且难以单测。`route_api.ts` 已抽取 grok/kimi/trend 的分权函数，建议 config/auth/session 等也走类似模式，将分权逻辑从 preload switch-case 中抽离。
3. **共享脱敏规则**：`logger.ts`、`config_redaction.ts` 各维护一套密钥 pattern，建议合并为 `src/shared/lib/secret_patterns.ts`，降低维护成本。

---

## 不确定项

1. **web 端 `connector.snapshot` 返回 `{}`**（`src/web/usageboard-web.ts:70`）：不确定是有意设计（web 靠 SSE 推送，snapshot 仅作 fallback）还是遗漏。如果 web UI 依赖 snapshot 初始化状态，空对象会导致首次渲染无数据。
2. **`preload/index.ts` 中 `plugin: connector_methods` 在三条路由都保留**：不确定 deprecated `plugin` 接口在 renderer 侧是否有实际调用方，若有则不能删；若无则三条路由均应移除以减少攻击面。
3. **`usageboard-web.ts:186` 的 `as unknown as UsageboardApi` 强转是否在 CI 有类型测试覆盖**：不确定是否有测试验证 web API 与接口的一致性，若无则建议添加。

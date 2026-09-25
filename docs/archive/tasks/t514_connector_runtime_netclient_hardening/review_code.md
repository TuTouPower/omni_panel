# Task review t514（reviewer_focus: 代码）

- task：`t514_connector_runtime_netclient_hardening`
- spec：`docs/tasks/t514_connector_runtime_netclient_hardening/spec.md`
- diff_anchor：`3219e1164269617313ed7068d15382d879181764`
- target：`git -C '/Users/karson/kar/code/omni_panel_t514' diff 3219e1164269617313ed7068d15382d879181764`
- round：Round 1
- reviewed_at：2026-09-25 15:15 UTC+8

reviewed_scope: 707c97d9f7e2da26

## Findings

### t514_code_f001 - AC-007 外部网络输入边界 zod safeParse 防御完全缺失实现

- 严重度：important
- 锚点：AC-007（各连接器对外部网络返回的非规范 JSON 数据通过 zod 校验拦截，不发生直转引发的运行时异常）
- 位置：`connectors/` 下全体连接器及 `src/main/core/connector/net-client.ts`
- 问题：整个代码库的 `connectors/` 目录下 20 个连接器没有任何一处引入 zod schema 或调用 `safeParse`。网络请求层（`net-client.ts` 中的 `get_json` / `post_json`）以及各连接器仍直接将外部返回反序列化为 `unknown` 并强转类型。当外部服务返回非规范 JSON、缺少关键字段或返回错误结构时，无法被 zod 校验拦截，会直接触发运行时的深层属性访问异常。
- 建议：按 spec 范围与采纳项 A128，在连接器外部边界（至少高风险连接器）定义网络响应 zod schema 并接入 `safeParse`，校验失败时统一收口并上报。

### t514_code_f002 - AC-005 各连接器私有重复工具代码未消除（仅 cpa 部分改动）

- 严重度：important
- 锚点：AC-005（连接器可通过 ctx.util 访问共享阈值与工具函数，各连接器内部不再包含重复的私有计算逻辑）
- 位置：`connectors/` 目录下除 `cpa` 外的其余 19 个连接器（如 `connectors/opencode_go/connector.ts:52`, `connectors/kimi/connector.ts:34`, `connectors/glm/connector.ts:30`, `connectors/tavily/connector.ts:21`, `connectors/commandcode/connector.ts:63` 等）
- 问题：虽然在宿主 `net-client.ts:596` 中注入了 `ctx.util`，但连接器侧仅在 `connectors/cpa/connector.ts` 中做了部分委托，其余 19 个连接器完全未改动。各连接器中依然各自保留着重复的私有计算逻辑（`to_number`, `to_pct`, `to_reset_at` 等），行为漂移与代码冗余并未消除。且 `connectors/cpa/connector.ts` 内部仍保留了完整的 private fallback 重复逻辑。
- 建议：将其余连接器中的私有 `to_number` / `to_pct` 等函数重构委托至 `ctx.util`，移除各连接器内部冗余的私有重复计算。

### t514_code_f003 - refresh-service.ts 传参 last_error 字符串导致 NonRetryableError 对象特性丢失无法短路重试

- 严重度：important
- 锚点：AC-003（接口返回 4xx 状态码或抛出代码语法异常时，不执行剩余 2 次多余重试）及不可重试错误基类契约
- 位置：`src/main/core/scheduler/refresh-service.ts:527` 与 `src/main/core/connector/runtime.ts:23`
- 问题：在 `refresh-service.ts:451` 中捕获异常后将其字符串化：`last_error = error instanceof Error ? error.message : String(error);`，并在第 527 行传入了该字符串：`is_non_retryable_error(last_error)`。而 `is_non_retryable_error` 检查 `typeof error === "object" && "non_retryable" in error` 仅对对象生效。这导致通过 `throw new NonRetryableError("custom message")` 抛出的自定义不可重试错误，因 `last_error` 为纯字符串且 message 不含 `HTTP \d{3}` / `SyntaxError` 正则时，`is_non_retryable_error` 评估为 `false`，重试逻辑无法短路，依然执行了多余重试。
- 建议：在 `refresh-service.ts` 的 catch 块中保留原始错误对象（例如 `last_error_obj = error`），并在第 527 行将原始错误对象传入 `is_non_retryable_error(last_error_obj)`；同时可在 `is_non_retryable_error` 中增加对 Error 对象的健全性保护。

### t514_code_f004 - is_fast_valid_observation 漏校验 reset_at/last_error 等关键字段致畸变数据放行

- 严重度：important
- 锚点：行为缺陷（畸变 observation 绕过 runtime 校验进入系统，引发 Local API / Store 消费崩溃）
- 位置：`src/main/core/connector/runtime.ts:173-209`
- 问题：`is_fast_valid_observation` 作为 observation 的 fast-path 校验，跳过了 `script_observation_schema.safeParse`，但其校验字段严格度弱于 schema：
    1. 完全遗漏了 `reset_at` 校验（schema 要求 `finite_number.nullable()`，fast-path 未校验该键，导致 `reset_at: undefined` 或非数字字符串合法放行）；
    2. 完全遗漏了 `last_error` 校验（schema 要求 `z.string().nullable()`，fast-path 未校验该键）；
    3. `raw_label` 和 `normalized_label` 在 schema 中要求 `z.string().min(1)`，但 fast-path 允许空字符串 `""`。
        当脚本返回缺少 `reset_at` / `last_error` 的对象时，fast-path 判定有效并直接加入 `observations`，绕过 `safeParse` 防御，导致后续在 Local API / Store 消费时因类型不符产生非预期错误。
- 建议：补全 `is_fast_valid_observation` 中对 `reset_at`（`o["reset_at"] === null || (typeof o["reset_at"] === "number" && Number.isFinite(o["reset_at"]))`）、`last_error`（`o["last_error"] === null || typeof o["last_error"] === "string"`）及 `raw_label.length > 0` 的校验，确保 fast-path 与 `script_observation_schema` 的强约束一致。

### t514_code_f005 - 范围中「统一 provider 权威来源为 manifest」未见任何交付改动

- 严重度：minor
- 锚点：spec 范围第 9 项（“统一 provider 权威来源为 manifest”）
- 位置：`src/main/core/connector/manifest-loader.ts` 等
- 问题：spec 范围中明确包含“统一 provider 权威来源为 manifest”（采纳项 A129），但在本次交付的 14 个文件中无任何代码涉及 provider 单一权威源的归一或类型放宽。
- 建议：评估是否将 A129 统一 provider 权威来源纳入后续独立 task（如建议 follow-up），或在 spec 中明确调整范围说明。

## 结论

- 本轮新发现：5 条（4 条 important，1 条 minor）
- 未进表的提示：
    - 文件过大：`src/main/core/connector/net-client.ts` 物理行数 629（≥ 400，本 task 净增 171 行）；`connectors/cpa/connector.ts` 757 行；`src/main/core/scheduler/refresh-service.ts` 625 行；`tests/integration/connector/net-client.test.ts` 1116 行（≥ 600）。建议后续进行功能模块拆分。
    - 圈复杂度：`is_non_retryable_error` 复杂度达 18（≥ 15），分支较深且存在类型处理隐患；`is_fast_valid_observation` 复合分支超 25。
    - blueprint 更新提示：`docs/blueprint/architecture.md` 尚未在本次提交中记录连接器基座安全、冷却与重试规范（可在 finalization 阶段补全）。
- 总体判断：AC-007 完全未实现，AC-005 大部分未落地，且存在 `NonRetryableError` 字符串化导致短路失效与 fast-path 校验漏洞，不可信，判定 FAIL。
- 系统性 follow-up：建议补充 task「连接器外部网络输入全量 zod 化与 manifest provider 权威源收口」（slug: `connectors_zod_boundary_and_provider_single_source`）。

### AC 复验方式

- AC-001：`re_verified`。查证 `net-client.ts:18` `MAX_RESPONSE_BYTES = 10 * 1024 * 1024` 与 `read_body_with_limit` 超限 `body.destroy()`，并运行 `tests/integration/connector/net-client.test.ts` 中 10MB abort 测试通过。
- AC-002：`re_verified`。查证 `net-client.ts:568` `realpath` 解析与 `is_within_allowed` 拦截，以及 `list_dir_recursive` 中 5000 截断并发遍历逻辑。
- AC-003：`re_verified`。查证 `net-client.ts:404` 4xx 错误截取前 500B 脱敏片段并拼入 message，查证 `runtime.ts:23` `is_non_retryable_error`，以及 `refresh-service.ts:527` 短路逻辑；复验发现 `refresh-service.ts` 传入字符串导致自定义 `NonRetryableError` 失效缺陷（见 f003）。
- AC-004：`re_verified`。查证 `runtime.ts:223` 冷却 key 结合 `ctx.instance_id`，并运行 `tests/integration/connector/runtime.test.ts` 中多实例冷却隔离测试通过。
- AC-005：`re_verified`。查证 `connectors/` 源码，发现除 `cpa` 之外其余 19 个连接器完全未接入 `ctx.util`，私有重复计算逻辑未消除（见 f002），判定未满足。
- AC-006：`re_verified`。查证 `script-cache.ts:24` 中 LRU(50) 淘汰与 `inflight` Promise 去重逻辑，并运行 `tests/integration/connector/script-cache.test.ts` 测试通过。
- AC-007：`re_verified`。查证 `connectors/` 源码，未发现任何 zod schema 定义与 `safeParse` 外部网络校验调用（见 f001），判定未实现。

coverage = 7 / 7 (100%)

verdict: FAIL

## Round 2 (2026-09-25 15:30 UTC+8)

### 前轮 Finding 复核

- **t514_code_f001 (AC-007)**：已消除。`src/main/core/connector/host-io.ts` 的 `HttpOpts` 支持 `schema: ZodType`，`net-client.ts:500-514` 的 `do_request` 中自动执行 `opts.schema.safeParse` 校验并拦截非规范 JSON；`src/main/core/connector/runtime.ts` 在沙箱上下文中注入 `z` 并完善了 `deep_freeze` 对 `z` 的兼容保护；`connectors/grok_bot/connector.ts` 中已接入 `sand_usage_schema`；集成测试 `tests/integration/connector/net-client.test.ts:1145` 与 `grok_bot_connector.test.ts:228` 覆盖通过。
- **t514_code_f002 (AC-005)**：已消除。`src/main/core/connector/host-io.ts` 声明 `ConnectorUtils` 契约，`net-client.ts:616-635` 注入 `ctx.util`；各连接器（`connectors/cpa`、`connectors/claude`、`connectors/glm`、`connectors/kimi`、`connectors/opencode_go`、`connectors/tavily` 等）中的私有重复转换逻辑（`to_number`、`to_pct`、`to_reset_at`）已委托至 `ctx.util`，消除多处重复代码与行为分叉隐患。
- **t514_code_f003 (AC-003)**：已消除。在 `src/main/core/scheduler/refresh-service.ts:297, 452, 529` 中保留原始异常对象 `last_raw_error` 并传入 `is_non_retryable_error(last_raw_error ?? last_error)`；`src/main/core/connector/runtime.ts:23-54` 对 `NonRetryableError` 对象结构、`SyntaxError` 以及非 408/429 的 4xx 状态码做完整短路判定；在调度器集成测试 `tests/integration/scheduler/refresh-service.test.ts:1252` 中真实验证了短路重试仅执行 1 次。
- **t514_code_f004 (A122)**：已消除。`src/main/core/connector/runtime.ts:185-224` 的 `is_fast_valid_observation` 已补齐 `reset_at`（null 或有限数值）、`last_error`（null 或字符串）、`raw_label.length > 0`、`normalized_label.length > 0` 等全部字段校验，严格对齐 `script_observation_schema`；并在 `tests/integration/connector/runtime.test.ts:380` 中通过畸变数据断言 fast-path 拒绝后回退至 `safeParse` 并在 `failed_accounts` 中准确报错。
- **t514_code_f005 (A129)**：已消除。`src/main/core/connector/manifest-loader.ts:45-51` 明确以 manifest 的 provider 字段为单一权威源，仅按 `connectorProviderSchema` 校验 snake_case 命名格式并更新警告日志。

### 本轮新发现

0 条。

### 未进表的提示

- 文件过大：`src/main/core/connector/net-client.ts` 物理行数 650（≥ 400，本 task 净增 192 行）；`src/main/core/scheduler/refresh-service.ts` 627 行；`connectors/cpa/connector.ts` 757 行；`tests/integration/connector/net-client.test.ts` 1163 行（≥ 600）；`tests/integration/scheduler/refresh-service.test.ts` 2169 行。均为既有存量较大文件，本 task 仅作必要加固，未产生可观测缺陷，降级为提示。
- 圈复杂度：`is_fast_valid_observation` 复合分支超 25，属于无副作用的纯属性只读校验卫语句，有完整测试与 zod safeParse 回退双重保障。

### 总体判断

前轮 5 条 finding 全部彻底修复，无新增 finding，各项 AC 行为验证完整且实现严密，判定 PASS。

### 系统性 follow-up

无。

### AC 复验方式

- AC-001：`re_verified`。查证 `net-client.ts:18` `MAX_RESPONSE_BYTES = 10 * 1024 * 1024` 与 `read_body_with_limit` 超限 `body.destroy()`；查证 `net-client.test.ts:1092` 模拟超 10MB 响应流流式中断断言；运行测试通过。
- AC-002：`re_verified`。查证 `net-client.ts:588` `realpath` 解析与沙箱边界断言；`net-client.ts:106` `list_dir_recursive` 中 5000 项安全截断与 `Promise.all` 并发遍历；查证 `net-client.test.ts:432, 1129` 测试通过。
- AC-003：`re_verified`。查证 `net-client.ts:404` 截取前 500B 脱敏片段；`refresh-service.ts:297, 529` 保留原始错误对象并传入 `is_non_retryable_error` 短路多余重试；查证 `refresh-service.test.ts:1252` 真实调度仅 1 次尝试测试通过。
- AC-004：`re_verified`。查证 `runtime.ts:238` 冷却 key 结合 `ctx.instance_id`，隔离同连接器多账号实例；查证 `runtime.test.ts:327` 隔离测试通过。
- AC-005：`re_verified`。查证 `net-client.ts:616` 注入 `ctx.util`；查证连接器（cpa, claude, glm, kimi, opencode_go, tavily 等）已将私有计算逻辑委托至 `ctx.util`；查证 `net-client.test.ts:1078` 工具方法断言通过。
- AC-006：`re_verified`。查证 `script-cache.ts:24-67` 中 `inflight` Map 并发编译去重与 LRU 容量淘汰；查证 `script-cache.test.ts:69, 85` 测试通过。
- AC-007：`re_verified`。查证 `host-io.ts` `HttpOpts` 支持 `schema: ZodType`，`net-client.ts:500` 自动执行 `opts.schema.safeParse` 校验并拦截非规范 JSON，`runtime.ts:83` 沙箱注入 `z`，`grok_bot/connector.ts:153` 接入 `sand_usage_schema`；查证 `grok_bot_connector.test.ts:228` 与 `net-client.test.ts:1145` 测试通过。

coverage = 7 / 7

reviewed_scope: 78052c56e50b925c

verdict: PASS

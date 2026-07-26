# Spike: Grok / Kimi OAuth Manager 低层 helper 提取边界

## 问题

t118 f002 报告 grok/kimi manager 低层 helper 约 150 行重复，但 manager 主体差异大。需要确定：

1. 哪些函数可安全提取到共享模块
2. 哪些函数结构相同但需参数化
3. 哪些函数因逻辑差异不可提取
4. 提取方案与风险

## 成功判据

- 逐函数比对有明确的三分类结论（相同 / 需参数化 / 不可提取）
- 提出的提取方案可直接指导 task 实现
- 风险点明确列出

## 尝试

逐行比对 `src/main/core/auth/grok_oauth_manager.ts`（587 行）与 `src/main/core/auth/kimi_oauth_manager.ts`（583 行）。

## 证据

### A. 完全相同的函数（可安全提取）

以下 13 个函数 / 8 个类型在两个文件中逐字节相同或仅有空白差异：

| #   | 名称                               | 行数 | 位置     |
| --- | ---------------------------------- | ---- | -------- |
| 1   | `is_token_response`                | 4    | 顶层     |
| 2   | `is_error_response`                | 4    | 顶层     |
| 3   | `form_encode`                      | 2    | 顶层     |
| 4   | `to_error`                         | 2    | 顶层     |
| 5   | `make_default_http_post`           | 20   | 顶层     |
| 6   | `clear_tokens`                     | 4    | 顶层     |
| 7   | `is_terminal_grant_error`          | 6    | 顶层     |
| 8   | `cancel_auto_refresh_timer`        | 4    | 工厂内部 |
| 9   | `schedule_auto_refresh_if_enabled` | 30   | 工厂内部 |
| 10  | `start_auto_refresh`               | 3    | 工厂内部 |
| 11  | `reconcile_auto_refresh`           | 10   | 工厂内部 |
| 12  | `cancel_device_login`              | 4    | 工厂内部 |
| 13  | `get_login_status`                 | 8    | 工厂内部 |

类型/接口：`HttpPost`, `DeviceCodeStart`, `LoginStatus`, `RefreshResult`, `AutoRefreshOptions`, `TokenResponse`, `TokenErrorResponse`, `StoredTokens` -- 除 grok `OAuthLoginResult`（缺少 `refresh_token`/`expires_at` 字段），其余相同。

**总计约 101 行可直接提取，无参数化需求。**

### B. 结构相同但参数/细节不同的函数（可提取但需参数化）

| #   | 名称                 | 差异点                                                                                                      | 参数化难度                                                  |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | `load_tokens`        | grok 顺序 3 次 `await`；kimi `Promise.all` 并行                                                             | 低：统一用 `Promise.all` 即可，行为等价                     |
| 2   | `store_tokens`       | grok 内联 `expires_at` 计算；kimi 提取 `compute_expires_at()`                                               | 低：提取 `compute_expires_at` 后两者一致                    |
| 3   | `start_device_login` | grok 传 `client_id` + `scope`；kimi 只传 `client_id`                                                        | 中：需参数化 form pairs 或配置对象                          |
| 4   | `poll_once`          | 不同 URL + 不同 form pairs                                                                                  | 中：同上，通过配置传入 token_url / client_id / extra_params |
| 5   | `schedule_retry`     | 仅 log 消息中 vendor 名不同（"Grok" vs "Kimi"）                                                             | 低：传入 vendor_name                                        |
| 6   | `await_completion`   | grok 有 `generation` + `enqueue_token_mutation` 包裹；kimi 直接存 token 且返回 `refresh_token`/`expires_at` | 高：grok 的 mutation 队列是核心并发控制，kimi 无此模式      |
| 7   | `stop_auto_refresh`  | kimi 额外清理 `retry_failure_counts`                                                                        | 低：传入可选的 cleanup callback                             |
| 8   | `shutdown`           | kimi 额外 `retry_failure_counts.clear()`                                                                    | 低：同上                                                    |

### C. 逻辑差异大，不可提取或高风险

| #   | 名称                             | 差异点                                                                                                                                                         | 风险                                                         |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1   | `refresh_now`                    | grok 有 `refresh_in_flight` 去重 + `enqueue_token_mutation` + `token_generations` 检查（约 60 行 vs 35 行）。grok 版本可防并发 refresh 重复请求，kimi 无此保护 | 高：强行统一会丢掉 grok 的并发安全或给 kimi 加不必要的复杂度 |
| 2   | `logout`                         | grok 用 `enqueue_token_mutation` + `advance_token_generation`；kimi 直接 `cancel_device_login` + 清理 `retry_failure_counts`                                   | 高：两者清理策略不同，反映各自状态模型                       |
| 3   | `form_headers` / `build_headers` | grok 同步返回 `{ Content-Type }`；kimi 异步，含 `Accept` / `X-Msh-Platform` / `X-Msh-Device-Id`                                                                | 高：抽象收益低，抽象成本高                                   |

**grok 独有的并发控制机制**（不可提取到共享模块）：

- `token_generations` Map + `get_token_generation` / `advance_token_generation`
- `token_mutation_tails` Map + `enqueue_token_mutation`
- `refresh_in_flight` Map

**kimi 独有的特性**：

- `get_device_id` / `make_default_get_device_id`（读取/生成 `~/.kimi-code/device_id`）
- `compute_expires_at`（可提取为共享 helper）
- `OAuthLoginResult` 含 `refresh_token` / `expires_at` 字段

### D. 常量对比

| 常量                        | grok   | kimi   | 可共享 |
| --------------------------- | ------ | ------ | ------ |
| `DEVICE_CODE_GRANT`         | 相同   | 相同   | 是     |
| `REFRESH_TOKEN_GRANT`       | 相同   | 相同   | 是     |
| `OAUTH_TOKEN_KEY` 等 3 个   | 相同   | 相同   | 是     |
| `SLOW_DOWN_PENALTY_SECONDS` | 5      | 5      | 是     |
| `REFRESH_MARGIN_MS`         | 5min   | 5min   | 是     |
| `REFRESH_RETRY_DELAY_MS`    | 60s    | 60s    | 是     |
| `MAX_REFRESH_RETRIES`       | 10     | 10     | 是     |
| `MIN_REFRESH_DELAY_MS`      | 1s     | 1s     | 是     |
| `MAX_TIMEOUT_MS`            | 2^31-1 | 2^31-1 | 是     |

所有 OAuth 协议常量和定时器参数完全相同。

### E. 工厂状态 Map 对比

| Map/Set                    | grok | kimi   | 说明      |
| -------------------------- | ---- | ------ | --------- |
| `auto_refresh_timers`      | 有   | 有     | 相同      |
| `auto_refresh_options`     | 有   | 有     | 相同      |
| `enabled_auto_refresh_ids` | 有   | 有     | 相同      |
| `retry_failure_counts`     | 有   | 有     | 相同      |
| `active_login_cancels`     | 有   | 有     | 相同      |
| `token_generations`        | 有   | **无** | grok 独有 |
| `token_mutation_tails`     | 有   | **无** | grok 独有 |
| `refresh_in_flight`        | 有   | **无** | grok 独有 |

## 结论

### 提取方案：Layer 1 -- 共享纯函数/类型/常量模块

**提取到** `src/main/core/auth/oauth_helpers.ts`（新建）。

**提取内容**：

1. **顶层纯函数**（7 个，约 42 行）：`is_token_response`, `is_error_response`, `form_encode`, `to_error`, `make_default_http_post`, `clear_tokens`, `is_terminal_grant_error`
2. **共享类型/接口**（约 40 行）：`HttpPost`, `DeviceCodeStart`, `LoginStatus`, `RefreshResult`, `AutoRefreshOptions`, `TokenResponse`, `TokenErrorResponse`, `StoredTokens`
3. **共享常量**（约 15 行）：`DEVICE_CODE_GRANT`, `REFRESH_TOKEN_GRANT`, `OAUTH_TOKEN_KEY` 等 3 key, 所有定时器常量
4. **统一 `load_tokens`**（用 `Promise.all`）+ 提取 `compute_expires_at` + 统一 `store_tokens`

**不提取**：

- `refresh_now`（grok 有并发控制，kimi 无）
- `logout`（清理策略不同）
- `form_headers` / `build_headers`（grok 同步 vs kimi 异步 + 额外 header）
- `await_completion`（grok 有 mutation 队列包裹）
- `schedule_retry`（引用 `refresh_now` 闭包，而 `refresh_now` 不提取）
- grok 的 `token_generations` / `enqueue_token_mutation` / `refresh_in_flight`

### Layer 2（暂不做）-- 闭包函数提取

`cancel_auto_refresh_timer`, `schedule_auto_refresh_if_enabled`, `start_auto_refresh`, `reconcile_auto_refresh`, `get_login_status`, `cancel_device_login` 可提取，但需将共享状态 Map 封装为 `OAuthRefreshState` 对象传入，且 `schedule_auto_refresh_if_enabled` 需注入 `refresh_now` 回调。约 55 行收益，参数化复杂度中等。建议 Layer 1 验证无回归后再评估。

### `OAuthLoginResult` 接口差异

grok 版只有 `saved` + `token?`；kimi 版多了 `refresh_token?` + `expires_at?`。提取时统一为 kimi 的超集版本，grok 侧补传字段即可。

### 量化收益

- Layer 1 可提取行数：约 97 行（纯函数 + 类型 + 常量 + `load_tokens` / `store_tokens`）
- 两个文件各减少约 48 行
- 新增 `oauth_helpers.ts` 约 100 行
- 净效果：消除重复，总行数基本持平

### 风险点

1. **`OAuthLoginResult` 超集化**：grok 的 `await_completion` 需补传 `refresh_token`/`expires_at`，改动小但需同步检查 grok 侧调用方是否忽略多余字段（TypeScript 结构类型自然兼容，风险低）。

2. **`store_tokens` 统一后 grok 侧行为变化**：grok 原版 `store_tokens` 在 `expires_in` 为 number 时用 `String(expires_at_epoch)` 写入；kimi 通过 `compute_expires_at` 做同样的事。提取后行为一致，无实际变化。

3. **`load_tokens` 统一为 `Promise.all`**：grok 原版串行读 3 个 key，改为并行后语义不变（vault.get 之间无依赖），且性能略有提升。无风险。

## 是否采纳

- 决定：是（Layer 1）
- 理由：Layer 1 约 97 行纯函数/类型/常量提取零风险，消除两文件间最机械的重复。Layer 2 闭包函数提取收益有限（55 行）且引入 state 对象参数化复杂度，暂不做。
- 后续 task：待分配

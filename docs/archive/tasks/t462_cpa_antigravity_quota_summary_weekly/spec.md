# Task spec

## 背景

CPA 网关的 antigravity 用量查询只调 `fetchAvailableModels`，按 `apiProvider`/`modelProvider` 聚出 `gemini-models` / `claude-gpt` 两条无窗口观测（`window: second`、`cycleDurationMs: null`）。CPA-Manager-Plus 已改走 `retrieveUserQuotaSummary` 主路径（`groups[].buckets[]`，`window` 区分 `5h`/`weekly`），失败才回退 `fetchAvailableModels`；且上游 antigravity 已不再提供 GPT。面板侧需对齐：gemini 与 claude 各输出五小时与周用量共 4 条，去掉 GPT。

## 契约区

### 范围

- `connectors/cpa/connector.ts` 的 antigravity 路径改走 `retrieveUserQuotaSummary` 三 endpoint 主路径（`daily` / `daily-sandbox` / `prod`），请求体 `{ project }`（`project` 取自 `loadCodeAssist` 的 `cloudaicompanionProject`），UA 对齐 CPA-Manager-Plus 的 `antigravity/cli` 形式。
- 主路径成功且有可用 bucket 时按 group×bucket 输出观测：gemini 与 claude 各五小时（`window: second`、`cycleDurationMs: 18_000_000`）与周（`window: day`、`cycleDurationMs: 604_800_000`）共 4 条；`used = 100 - remainingFraction×100` 钳制 `[0,100]`，`reset_at` 取 bucket `resetTime`。
- 去 GPT：不再匹配 `API_PROVIDER_OPENAI_VERTEX` / `MODEL_PROVIDER_OPENAI`（及名称含 `gpt` 的外部模型归组），不输出任何 GPT 相关观测；Claude 分组只含 anthropic 系模型。
- 全新 `metric_id` / `raw_label` 方案（不含旧 `gemini-models` / `claude-gpt`），旧 trend 不延续（用户 2026-09-09 确认丢弃旧数据）。
- 主路径整体无可用数据时回退 `fetchAvailableModels`（现有三 endpoint），回退输出 gemini / claude 共享组观测（去 GPT 后各至多 1 条）。
- 同步更新 `tests/integration/connector/cpa-connector.test.ts` 的 antigravity 用例与受影响的 fixture/spec 文档。

### 非范围

- 不改直连 antigravity 占位 stub（`connectors/antigravity/connector.ts` 仍报暂不支持）。
- 不改 claude / codex / kimi 的解析逻辑与 `monitor_*` 开关语义。
- 不做旧 `metric_id`（`gemini-models` / `claude-gpt`）历史数据迁移。
- 不引入 subscription（plan/tier）查询与展示。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：summary 返回 gemini / claude 分组各含 5h 与 weekly bucket 时，输出 4 条 antigravity 观测（gemini 五小时、gemini 周、claude 五小时、claude 周）；五小时条 `window` 为 `second` 且 `cycleDurationMs` 为 `18_000_000`，周条 `window` 为 `day` 且 `cycleDurationMs` 为 `604_800_000`；`used` 等于 `100 - remainingFraction×100`（钳制 `[0,100]`），`reset_at` 取 bucket `resetTime`。
- [ ] AC-002：上游含 `API_PROVIDER_OPENAI_VERTEX` / `MODEL_PROVIDER_OPENAI` 模型或 GPT bucket 时，不产生任何 GPT 相关观测；输出中无含 `gpt` 的 `metric_id` / `raw_label` / `normalized_label`。
- [ ] AC-003：summary 三 endpoint 全失败或均无可用 bucket 时，回退 `fetchAvailableModels` 并输出 gemini / claude 共享组观测（去 GPT 后各至多 1 条，`used` 取组内最小剩余的补数）。
- [ ] AC-004：输出的 `metric_id` 均不含旧 `gemini-models` / `claude-gpt`（全新 id 方案，旧 trend 不延续）。
- [ ] AC-005：既有 claude / codex / kimi 的 CPA 集成用例全绿，无回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- 全部 AC 可自动测试（`run_connector` 打桩 `ctx.http.post_json` / `get_json`，断言 observations）。

## 上下文区

- 来源：用户需求（2026-09-09：参考 CPA-Manager-Plus 改 antigravity 用量查询；gemini/claude 五小时加周用量；去 GPT；全新 id）。参考实现 `home/karon/github_repo/CPA-Manager-Plus` 的 `apps/web/src/utils/quota/constants.ts`（`ANTIGRAVITY_QUOTA_SUMMARY_URLS` 主路径、`ANTIGRAVITY_AVAILABLE_MODELS_URLS` 回退、`antigravity/cli` UA）、`builders.ts`（`buildAntigravityQuotaGroups`：groups/buckets 解析，`5h`/`weekly` 窗口排序）、`providerRequests.ts`（`fetchAntigravityQuota`：summary 优先、空则回退），2026-09-09 核实。

### 有意不测

- CPA-Manager-Plus 的 quota 库存语义（空 groups 视为完整库存）：不测，omni_panel 连接器无库存概念，空即回退或报失败账号。
- 真实上游 endpoint 连通性与 `loadCodeAssist` 真实 project：不测，打桩覆盖；上游字段漂移风险见风险项。
- e2e fixture（`tests/e2e/fixtures/synthetic.json`）中 antigravity 旧两条指标的刷新：fixture 为 web e2e mock 数据，与采集逻辑无关，按需由执行期判断是否同步。

### 测试策略

- `tests/integration/connector/cpa-connector.test.ts`：summary 主路径用例（gemini/claude 各 5h+weekly payload，断言 4 条观测的窗口、`cycleDurationMs`、`used`、`reset_at` 与全新 `metric_id`），去 GPT 用例（含 OPENAI provider 模型，不断言其输出），回退用例（summary 全 404 → 模型列表输出共享组）；旧“两条 five-hour 观测”用例按语义变更整体删除（新用例覆盖新语义，不就地改预期）。
- fixture 取真实 summary 形态（`groups[].displayName/buckets[].bucketId/displayName/window/remainingFraction/resetTime`，大小写双形态至少覆盖一例）。
- `pnpm test` 中 CPA 相关套件全绿。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无（summary 的 groups/buckets 形态已按 CPA-Manager-Plus 源码与测试 payload 核实，camel/snake 双形态由解析兼容覆盖）。

### 风险与回退

- 风险：上游 summary 字段漂移导致 buckets 全被滤除时面板显示回退的共享组（窗口信息丢失），属可接受降级；`remainingFraction` 缺失按 CPA-Manager-Plus 语义视为不可用（跳过，不按 0 参与聚合，避免误报 100% 用尽）。
- 回退：单 commit 还原；回退路径（`fetchAvailableModels`）与主路径相互独立，可分别验证。

### 依赖与约束

- 无前置依赖；约束：连接器沙箱禁 `import`/`export`，解析函数留在 `connectors/cpa/connector.ts` 单文件；UA 字符串为公开常量非 secret。

### Finalization 时更新的 blueprint

- `docs/specs/connector-cpa-runtime.md`：antigravity 条目改为 quota-summary 主路径、gemini/claude 五小时加周共 4 条、去 GPT、全新 id。
- `docs/specs/connector-direct.md`：antigravity 行如提及 CPA 侧分组，随之同步（占位 stub 本体不变）。

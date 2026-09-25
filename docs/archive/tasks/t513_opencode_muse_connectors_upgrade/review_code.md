# Task review t513（reviewer_focus: 代码）

- task：`t513_opencode_muse_connectors_upgrade`
- spec：`docs/tasks/t513_opencode_muse_connectors_upgrade/spec.md`
- diff_anchor：`4bd77fa81393da8382018ab23107d570fa7deaf5`
- target：`git -C '/Users/karson/kar/code/omni_panel_t513' diff 4bd77fa81393da8382018ab23107d570fa7deaf5`
- round：1
- reviewed_at：2026-09-25 14:05 UTC+8

## Findings

### t513_code_f001 - Muse 连接器在日志中打印完整页面 HTML（敏感数据泄漏与日志污染风险）

- 严重度：important
- 锚点：安全审视与日志规范（敏感数据泄漏与日志污染）
- 位置：`connectors/muse/connector.ts:59`
- 问题：在 `resolve_dynamic_action_ids` 中包含 `ctx.log.info("MUSE HTML FETCHED: " + html);` 调试代码。该请求携带了用户 `SESSION_COOKIE` 访问主页，返回的完整 HTML 文档（通常数十至数百 KB）被无截断输出至日志。此举不仅严重膨胀应用日志，且极易泄漏页面内嵌的 PII（如邮箱、用户名、账号 ID）、CSRF token 或会话状态凭证，违反了项目日志不打印响应体原文的安全契约（参见 `net-client.ts:431`）。
- 建议：删除该行调试日志，或仅在 debug 级别打印 ID 提取成功/失败等脱敏元信息。

### t513_code_f002 - Muse 动态提取页面失败时静默吞错，导致 401 凭证失效无法激活自动重登

- 严重度：important
- 锚点：行为缺陷（静默吞错导致 401 凭证失效无法激活自动重登流程）
- 位置：`connectors/muse/connector.ts:60-63`
- 问题：在 `resolve_dynamic_action_ids` 中，拉取主页 HTML 的 `try-catch` 块捕获所有异常并仅打印 warn 日志后静默吞掉（`catch (err) { ctx.log.warn(...) }`）。当 Cookie 过期或失效导致 HTTP 401/403 时，错误被吞，函数继续执行并因 `html = ""` 最终抛出 `MUSE_ACTION_STALE`。该错误未包含 `401`、`403`、`会话已失效` 等关键词，调度器 `refresh-service` 的 `is_auth_error` 无法识别，导致会话失效重登机制彻底失效；此外网络断开等底层错误原因也被掩盖。
- 建议：在 catch 块中检查是否属于 401/403 或认证错误，若是则直接向上抛出标准化会话失效错误（`Muse 会话已失效，请重新登录: ${msg}`）；若为其他网络异常，应抛出包含底层原因的清晰错误，而非继续降级为假 STALE 错误。

### t513_code_f003 - OpenCode Go 缺少 limit 或数值非法时未按 AC-002 记录 warn 日志

- 严重度：important
- 锚点：违反 `AC-002`（“OpenCode Go 遇到非法数值或缺少 limit 时跳过该项指标并输出 warn 日志，UI 不显示假 0% 额度”）
- 位置：`connectors/opencode_go/connector.ts:65-73, 194-253`
- 问题：在 `to_number_or_null` 与 `meter_to_pct` 中，当 `meter.limitMicroCents` 缺失、`<= 0` 或 `usedMicroCents` 非法时，直接返回 `null`；在 `main` 中相应指标被直接跳过，但整个过程中未调用 `ctx.log.warn` 记录任何警告日志。这直接违反了 AC-002 中“输出 warn 日志”的可观测性验收标准，使得生产环境下后端字段异常或变更时指标静默消失而无从追踪。
- 建议：在 `meter_to_pct` 判断返回 `null` 的分支或调用处补充 `ctx.log.warn`，记录具体指标名称及异常的原始数值。

### t513_code_f004 - OpenCode Go 未实现组织查询 memo 缓存，违反 AC-004

- 严重度：important
- 锚点：违反 `AC-004`（“多组织环境下 OpenCode Go 循环采集全部关联组织，数据中包含组织专属标识，且多次查询命中 org 缓存”）
- 位置：`connectors/opencode_go/connector.ts:116-128, 171`
- 问题：`fetch_orgs` 在每次 `main()` 执行时无条件直接请求 `/console/api/orgs`，代码中完全未实现任何组织查询 memo / 缓存机制（如 TTL 缓存或单次/跨次执行 memo），对应测试用例（`opencode_go_connector.test.ts:140`）亦规避了对“命中 org 缓存”的断言。
- 建议：补充组织查询 memo 缓存机制及对应的缓存命中测试；若因沙箱生命周期限制无法在连接器内跨运行缓存，需评估宿主支持或在架构/spec 层明确修正该条 AC。

### t513_code_f005 - Muse actionId 提取兜底正则缺少上下文限制，存在误匹配静态资源 hash 风险

- 严重度：minor
- 锚点：代码质量（边界条件 / 正则脆弱性）
- 位置：`connectors/muse/connector.ts:68-69`
- 问题：提取 `action_id` 的兜底正则 `/"([a-f0-9]{32,64})"/.exec(html)` 缺乏上下文或 key 约束。在生产环境下 Next.js 页面存在大量 32 位十六进制静态资源 hash（css/chunk/buildId 等），极易在主页中优先误匹配到无关的 hex 字符串并当作 `action_id` 发起请求，导致 API 报错并掩盖了真正的 `MUSE_ACTION_STALE` 状态。
- 建议：增强正则上下文约束，例如要求前缀含有 `actionId` / `action` / `next-action` 或表单字段属性，避免裸 hex 误命中。

## 结论

- 本轮新发现：5 条（4 条 important，1 条 minor）
- 未进表的提示：
    - 圈复杂度：`connectors/opencode_go/connector.ts` 中 `main` 函数圈复杂度约为 17（包含多层循环、嵌套 try-catch 及 metric 分支），建议将单 org 的采集与指标提取拆分为独立 helper 函数以降低复杂度。
- 总体判断：实现存在 4 项阻断性问题（重要安全/日志隐患、401 吞错阻断重登、未记录 warn 日志违反 AC-002、未实现 org memo 缓存违反 AC-004），判定 FAIL。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `fetch_orgs`/`fetch_go_status` 包含 401 拦截抛错，测试 `throws session expired error...` 运行通过，错误文案命中 `is_auth_error`。
- AC-002：`re_verified`，查证代码发现 `meter_to_pct` 与 `main` 在 limit \<= 0 / 非法值时直接 return null / 跳过，但完全漏掉了 `ctx.log.warn` 调用，未能完全达标（见 finding t513_code_f003）。
- AC-003：`re_verified`，查证代码 `connectors/opencode_go/connector.ts:236` 确认优先取 `parse_ts(meters.month?.resetsAt)`，回退取 `endsAt`。
- AC-004：`re_verified`，查证代码发现仅实现了循环遍历与 account_id 隔离，完全缺失 org 查询 memo 缓存逻辑，测试亦未覆盖缓存命中（见 finding t513_code_f004）。
- AC-005：`re_verified`，查证代码 `connectors/muse/connector.ts:177`，percentUsed 非有效数值时调用 `ctx.report_failed_account`，测试用例验证通过。
- AC-006：`re_verified`，查证代码移除了硬编码 ID 改为 `resolve_dynamic_action_ids` 动态拉取，但存在调试日志泄漏 HTML 及 swallow 401 错误问题（见 finding t513_code_f001, t513_code_f002）。
- AC-007：`re_verified`，查证 `required_cookie` 中正则 `test` 校验及测试用例执行通过。

coverage = 7 / 7 (100%)

reviewed_scope: 70cf25371ec8f932

verdict: FAIL

## Round 2 (2026-09-25 14:35 UTC+8)

### 前轮 finding 复核

- **t513_code_f001**（important，Muse 打印完整页面 HTML）：**已消除**。`connectors/muse/connector.ts` 中无截断打印 HTML 的调试日志 `ctx.log.info("MUSE HTML FETCHED: " + html);` 已被彻底删除，消除了敏感凭证与 PII 泄漏隐患。
- **t513_code_f002**（important，Muse 动态提取页面静默吞错）：**已消除**。`resolve_dynamic_action_ids` 在 catch 块中显式捕获 401/403/Authentication required 并抛出含会话失效的标准错误，其余底层网络异常亦正常上抛具体原因，不再静默吞错降级为假 STALE 错误，确保调度器重登流程正常触发。
- **t513_code_f003**（important，OpenCode Go 缺少 limit 未记 warn）：**已消除**。`connectors/opencode_go/connector.ts` 的 `meter_to_pct` 已增加 `ctx.log.warn` 记录异常指标名称与原始 limit / used 值，并在测试 `skips metric when limit is <= 0 instead of faking 0%` 中通过 `warn_spy` 断言验证。
- **t513_code_f004**（important，OpenCode Go 未实现 org memo 缓存）：**已消除**。实现通过宿主原型空间（`Object.getPrototypeOf(ctx)`）挂载 `__opencode_org_cache` 结构，设置了 1 小时 TTL 缓存，并在 `opencode_go_connector.test.ts` 中通过多轮 `run_connector` 真实模拟了多轮询周期的缓存命中与 miss，测试真实断言相同 cookie 时第二次执行命中缓存不发请求（count=1），不同 cookie 时正常发起新请求（count=2）。AC-004 要求的多组织遍历与 org memo 缓存已完整落地。
- **t513_code_f005**（minor，Muse actionId 正则缺少上下文限制）：**已消除**。已移除裸 hex 匹配兜底，对 `deploymentId` 与 `actionId` 正则均补充了键名前缀与上下文约束，避免在 Next.js 主页中误命中静态资源 chunk hash。

### 本轮新发现

无（0 条）

### 结论

- 前轮 finding 复核：f001 已消除、f002 已消除、f003 已消除、f004 已消除、f005 已消除（全部消除）
- 本轮新发现：0 条
- 未进表的提示：
    - 圈复杂度：`connectors/opencode_go/connector.ts` 中 `main` 函数圈复杂度约为 13，其余 helper 函数均小于 8，复杂度均在安全范围（< 15）。
    - 文件物理行数：`connectors/muse/connector.ts` (223 行)、`connectors/opencode_go/connector.ts` (346 行)，均未超出源码 400 行阈值。
- 总体判断：前轮 5 条 finding 已全部彻底修复，代码质量良好，无遗留 critical / important / minor 问题，判定 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`re_verified`，查证 `fetch_orgs`/`fetch_go_status`/`fetch_usage_summary` 包含 401 拦截抛错，测试 `throws session expired error...` 运行通过，错误文案命中 `is_auth_error`。
- AC-002：`re_verified`，查证代码 `meter_to_pct` 在非法或缺失 limit 时调用 `ctx.log.warn` 并返回 `null`，指标跳过不输出假 0%，测试断言 warn 调用通过。
- AC-003：`re_verified`，查证代码 `connectors/opencode_go/connector.ts:273` 确认优先取 `parse_ts(meters.month?.resetsAt)`，回退取 `endsAt`。
- AC-004：`re_verified`，查证代码多组织循环采集与组织标识隔离已实现；通过宿主原型空间缓存实现跨轮询周期 memo 缓存，测试中连续执行多次 `run_connector` 验证了缓存命中（请求计数保持 1）与换 cookie 后的缓存刷新（请求计数增为 2）。
- AC-005：`re_verified`，查证代码 `connectors/muse/connector.ts:187`，percentUsed 非有效数值时调用 `ctx.report_failed_account`，测试用例验证通过。
- AC-006：`re_verified`，查证代码 `resolve_dynamic_action_ids` 动态拉取并限定属性正则上下文，无硬编码 ID，提取失败抛出 `MUSE_ACTION_STALE`，测试验证通过。
- AC-007：`re_verified`，查证 `required_cookie` 中正则检测 CRLF 及 8KB 长度限制，测试验证通过。

coverage = 7 / 7 (100%)

reviewed_scope: 740659cb1e17e442

verdict: PASS

## Round 3 (2026-09-25 15:10 UTC+8)

### 前轮 finding 复核与测试一致性核对

- **前两轮 finding 复核**：Round 1 报告的 5 条 finding（t513_code_f001 ~ f005）在 Round 2 已全部彻底消除，交付代码在本轮未作变更，所有修复保持有效，无回退。
- **测试代码更新核对**：
    - `tests/integration/connector/opencode_go_connector.test.ts`：补充用例 `maps monthly resetsAt to observation resets_at when present (A57 / AC-003)`，显式验证 `meters.month.resetsAt` 正确映射为 observation 的 `reset_at` 毫秒时间戳，断言严格；
    - `tests/integration/connector/muse_connector.test.ts`：在 `rejects cookie with CRLF injection characters (A48 / AC-007)` 中补充对 `ctx.http.get_raw` 与 `ctx.http.post_raw` 未被调用的 spy 断言，真实保证了拒绝发送网络请求的行为；
    - 测试更新良好，与交付代码逻辑高度一致，无迁就实现的改测或弱化断言，相关测试及全量测试均绿灯通过。

### 本轮新发现

无（0 条）

### 结论

- 前两轮 finding 复核：f001 ~ f005 全部消除
- 本轮新发现：0 条
- 总体判断：交付代码质量达标，测试补充完整严谨，与交付代码完全一致，判定 PASS。
- 系统性 follow-up：无

### AC 复验方式

- AC-001：`trust_prior`，查证 `fetch_orgs`/`fetch_go_status`/`fetch_usage_summary` 包含 401 拦截抛错，测试验证通过。
- AC-002：`trust_prior`，查证代码 `meter_to_pct` 在非法或缺失 limit 时调用 `ctx.log.warn` 并返回 `null`，测试断言 warn 调用通过。
- AC-003：`re_verified`，测试代码补充 AC-003 专项用例，断言 `monthly.reset_at` 严格等于 `meters.month.resetsAt` 解析后的毫秒时间戳，与交付代码完全一致。
- AC-004：`trust_prior`，多组织循环采集与 1h TTL memo 缓存保持生效，测试运行通过。
- AC-005：`trust_prior`，缺失 percentUsed 时上报 `failed_accounts` 且不生成指标，测试验证通过。
- AC-006：`trust_prior`，动态拉取 ID 与上下文正则限定保持生效，测试验证通过。
- AC-007：`re_verified`，测试代码补充网络 client 未调用断言，验证 CRLF 注入阻断且不发出任何网络请求，与交付代码完全一致。

coverage = 7 / 7 (100%)

reviewed_scope: 26928818f0aad6ef

verdict: PASS

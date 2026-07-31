# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p011。

2026-07-31 实测：本机到 xAI/Grok 域名网络中断期间，grok billing poll 连接超时 → 历史观测标 stale → 账号行显示「已过期」+「采集失败」+「重新登录」，与凭证失效的呈现完全不可区分。用户据此退出登录试图重登，token 被清空，而 device-code 登录因网络未恢复无法完成，之后 poll 一律 401，面板长期显示「已过期」。

两个可验证的产品机制缺陷：

1. 账号行的「重新登录」按钮对任意采集错误都显示（`src/renderer/components/ProviderAccountRow.tsx:119` `show_relogin_button` 只看 error 非空）。该入口的设计意图是按 `is_auth_error` 门控，只应对凭证失效类错误显示。
2. OAuth（poll）连接器 poll 收到 401 时没有任何即时兜底：自动重登/重刷路径只对 manifest capabilities 含 `session` 的连接器生效（`src/main/core/scheduler/refresh-service.ts:366-403`），OAuth 连接器 auth 错误直接放弃，只能等定时自动刷新；若定时链已断（refresh_token 失效被清空、重试耗尽），之后每次 poll 都 401 且无自救。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 渲染层：账号行「重新登录」按钮改为仅对凭证失效类错误显示（复用 `is_auth_error` 判定），非凭证类采集错误只显示「已过期」/「采集失败」badge。
- 调度层：OAuth（poll）连接器 poll 因 auth 错误（401/403）失败时，触发一次即时 token 刷新（复用对应 OAuth manager 的 `refresh_now`），刷新成功后重试一次采集；刷新失败或实例无 refresh token 时维持现有 stale 标记行为。
- 两层各自的回归测试。

### 非范围

- 不改「已过期」badge 的存在与 stale 标记机制本身（数据新鲜度语义不变）。
- 不改 session 连接器现有的 cookie 自动重登路径。
- 不做网络错误与凭证失效的 badge 文案再设计（如新增「网络异常」badge）。
- 不改 OAuth manager 的定时自动刷新调度与重试策略。
- 不处理 logout 确认交互（如「退出登录」二次确认）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [x] AC1：账号行在采集错误为非凭证类（如连接超时、5xx、解析失败）时不显示「重新登录」按钮；错误为凭证失效类（401/403、token 失效文案）时仍显示。
- [x] AC2：OAuth poll 连接器采集因 auth 错误失败时，对该实例触发一次即时 `refresh_now`；刷新成功后本轮重新采集，成功则观测不标 stale。
- [x] AC3：即时刷新失败（refresh_token 终态失效、无 refresh token、网络仍不通）时，行为退化为现有路径：历史观测标 stale、状态按失败处理，不引入额外重试风暴（每个实例每轮刷新周期至多一次即时刷新尝试）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- AC1：renderer 单测，构造 `AccountError` 分别为超时文案与 401 文案，断言按钮渲染与否；判定函数直接复用 `is_auth_error`。
- AC2/AC3：refresh-service 集成测试，fake connector 报 auth 错误，mock grok OAuth manager `refresh_now` 分别成功/失败，断言调用次数、重试采集与 stale 标记。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- `is_auth_error` 现有匹配规则已核实：`net-client` 对 HTTP 错误生成 `HTTP <status>: request failed (<bytes> bytes)`；renderer 判定当前不匹配裸 `HTTP 401/403`，连接超时文案（如 `ETIMEDOUT`、`socket hang up`）不匹配；refresh-service 判定已匹配 401/403。实现需统一认证错误语义并补真实文案回归测试。验证方式：读取 `net-client.ts`、Grok connector、两处判定函数与现有测试，结论记录于 `docs/spikes/s004_classify_collect_failure/report.md`。
- refresh-service 与 grok/kimi OAuth manager 之间已核实无现成依赖注入入口；`main/index.ts` 在创建 refresh-service 前已创建两个 manager，且 manager 均暴露 `refresh_now(instance_id)`。实现通过 `RefreshServiceDeps` 注入按 connector/instance 调用的 OAuth refresh 回调；Grok/Kimi script auth 失败位于 `failed_accounts` 路径，需在该路径触发兜底。验证方式：读取 refresh-service、OAuth manager、manifest 与主进程接线，结论记录于 `docs/spikes/s004_classify_collect_failure/report.md`。

### 风险与回退

- 风险：即时刷新与定时自动刷新并发触发，造成重复 refresh 请求或 token 写竞争；`is_auth_error` 误判导致按钮该显不显。
- 回退：改动集中在渲染层一个判定与调度层一个分支，revert 实现 commit 即恢复原行为；OAuth manager 已有 per-instance token mutation 队列可复用防并发。

### 依赖与约束

- 依赖 `is_auth_error`（`src/renderer/components/provider_card_states.tsx`）作为唯一凭证失效判定口径；调度层若需同类判定应复用同一语义而非新造规则。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：refresh 失败处理一节补充 OAuth 连接器 401 即时刷新兜底链路（如该节存在对应描述）。

# Task spec

## 背景

grok 与 kimi 两个 device-code OAuth manager 各 ~300 行近全量重复，已出现行为漂移：kimi `logout` 会 `cancel_device_login` 并清 `retry_failure_counts`，grok 两者都不做；kimi `stop_auto_refresh` 清 retry 计数而 grok 不清。t127 已把纯函数抽进 `oauth_helpers.ts`，但 manager 层仍整体复制。IPC 层（`grok_auth_ipc.ts`/`kimi_auth_ipc.ts` 152 行逐字重复）与 preload 层（`oauth_api.ts` 工厂重复）同源问题。

## 契约区

### 范围

- 把 device-code OAuth manager 参数化（endpoints/client_id/header builder/device-id resolver），grok/kimi 只保留常量与差异配置，删除两份重复实现。
- IPC 层抽参数化注册器 `register_oauth_device_ipc`，两文件收敛为一个实现 + 参数。
- preload 层抽单一工厂 `create_oauth_apis<TReadonly, TSettings>`，保留两个类型化导出。
- 消除行为漂移：grok `logout` 对齐 kimi（`cancel_device_login` + 清 `retry_failure_counts`）；grok `stop_auto_refresh`/`shutdown` 清 `retry_failure_counts`。

### 非范围

- 不改 OAuth 协议/端点本身。
- 不重写错误处理与取消时序（见 t340）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：grok/kimi 共用同一参数化 manager 实现，manager/IPC/preload 三处不再存在逐字重复的成对实现。
- [ ] AC-002：grok `logout` 与 kimi 行为一致（调用 `cancel_device_login` 并清 `retry_failure_counts`）。
- [ ] AC-003：grok `stop_auto_refresh` 与 `shutdown` 清 `retry_failure_counts`（与 kimi 对齐）。
- [ ] AC-004：参数化重构后 grok/kimi 既有 OAuth 单测全部通过，无行为回归。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 为结构断言；AC-002/003 为行为单测；AC-004 为回归测试。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`grok_oauth_manager.ts:99-469`、`grok_auth_ipc.ts:111`、`oauth_api.ts:26`、`grok_oauth_manager.ts:347`/`:430-434`/`:449`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用既有 grok/kimi oauth manager 单测，断言参数化后行为不变。
- 新增「行为漂移对齐」断言：logout/stop_auto_refresh/shutdown 对 grok 与 kimi 产生相同副作用。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：参数化抽象边界划错，导致某 provider 的隐式差异被强行抹平。
- 回退：抽象仅收敛结构性重复，保留差异配置注入点；漂移点以 kimi（已实现 cancel/清理）为准对齐 grok。

### 依赖与约束

- 依赖：t127 已抽出的 `oauth_helpers.ts` 纯函数。
- 约束：不改变 grok/kimi 对外 OAuth 行为契约。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：OAuth 层结构从「双实现」改为「参数化 manager + 厂商配置」。

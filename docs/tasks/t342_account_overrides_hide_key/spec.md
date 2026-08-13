# Task spec

## 背景

隐藏账号 override 写入键与消费键契约错配：`hide_account` 把 `item.accountId`（如 CPA 子账号 `auth-a` 或直连 `deepseek`）写入 `config.accountOverrides.hidden[provider]`；唯一消费方 `apply_account_overrides` 却按 `account.id`（=`accountKey`，`sourceInstanceId|label|accountLabel` 或 `sourceInstanceId|accountId`）过滤。两键永不相交，隐藏持久化成功但主面板仍显示该账号；settings UI 按裸 `accountId` 判定已隐藏，形成「UI 已隐藏、主面板照常显示」的静默失效。

## 契约区

### 范围

- `hide_account` 改为写 `accountKey(item)`。
- `accounts_list.tsx` 的 `is_hidden` 判定同步改为 `accountKey(item)`。
- 补端到端用例覆盖真实隐藏流程（写→读→主面板隐藏）。

### 非范围

- 不改 `apply_account_overrides` 按裸 accountId 匹配（会破坏多实例去重语义，不推荐）。

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

- [ ] AC-001：隐藏某账号后，主面板不再显示该账号（写键与读键一致）。
- [ ] AC-002：settings 侧「已隐藏」判定与主面板过滤口径一致。
- [ ] AC-003：存在端到端（或集成）测试覆盖「隐藏 → 持久化 → 主面板过滤」完整链路。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：单测断言写键等于 accountKey，集成测试覆盖写读一致。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`SettingsView.tsx:195`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 单测：`hide_account` 写入键 == `accountKey(item)`；`is_hidden` 与 `apply_account_overrides` 用同一键函数。
- 集成：构造 gateway 多实例 + 直连账号，断言隐藏后 `apply_account_overrides` 过滤结果为空。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：accountKey 对某些直连账号与裸 accountId 相同（无 label 时），改动可能影响去重语义。
- 回退：改动仅收敛读写键到同一函数；若多实例去重语义受影响，回退本 commit 并另立 task。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

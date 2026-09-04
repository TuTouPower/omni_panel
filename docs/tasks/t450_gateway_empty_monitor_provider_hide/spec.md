# Task spec

## 背景

CPA 网关实例 `monitor_kimi=true` 但采集 items 无任何 kimi 记录时，用量面板仍渲染 kimi 空卡「暂无账号请添加数据源」。直连 kimi 账号已删，空卡是网关 monitor 开关造成的空 provider。p217。

## 契约区

### 范围

- `visible_providers_from_groups`：gateway(CPA) connector 在 snapshot ready 且 items 非空时，仅把 activeProviders 与 items 实际出现 provider 的交集并入可见集；monitor 空 provider 剔除。
- snapshot failed / loading / idle（无 items）时 gateway 保留全部 activeProviders（失败态需挂 banner）。
- 补单测覆盖。

### 非范围

- 直连 connector 可见性语义（enabled 即可见，不改）。
- providerOrder 残留条目清理（config-store prune 既有机制）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `.repo_template/docs/usage.md`「命名与格式」。

<!-- /规范 -->

- [ ] AC-001：CPA ready 且 items 含 codex/antigravity 不含 kimi、monitor_kimi=true 时，可见 provider 不含 kimi（空 monitor provider 剔除）。
- [ ] AC-002：同 CPA items 含 codex 时 codex 仍可见（有数据 monitor provider 保留）。
- [ ] AC-003：CPA snapshot failed（无 items）时其 monitor provider 全部仍可见（失败态可挂 banner）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

全部 AC 可自动测试（provider-usage 纯函数单测）。

## 上下文区

- 来源：p217（2026-09-04 实测：config CPA monitor_kimi=true + snapshot-cache items 无 kimi → 空卡；根因 visible_providers_from_groups:430-442）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- provider-usage 单测（现有 visible_providers_from_groups / build_provider_usage_groups fixture 风格）：构造 CPA connector（source='cpa'、snapshot ready + items 指定 provider 集合、activeProviders 多 provider）断言可见集。
- 沿用 connector fixture 构造，不 mock 被测逻辑。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：判定误伤 CPA failed/loading 态可见性（banner 丢失）；items 判定的 provider 键名不一致。
- 回退：还原 visible_providers_from_groups；可见性纯前端，无数据迁移。

### 依赖与约束

- 前置：无。
- 约束：gateway 判定沿用 connector.source==='gateway'（t040 同口径）；snapshot ready 空 items 视为无 items 走保留分支。

### Finalization 时更新的 blueprint

- 无

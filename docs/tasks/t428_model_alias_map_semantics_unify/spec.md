# Task spec

## 背景

前端 originalToAlias 先写获胜（`src/renderer/views/TokenStatsView.tsx:533-541`，`if (!map.has(m)) map.set(m, alias)` :537），后端 dashboard_alias_resolver 后写覆盖（`src/main/core/token-stats/token-stats-store.ts:349-357`，`lookup.set(key, item.alias)` :354，且被测试锁定 `token-stats-store.test.ts:2691`）。同一 key 出现在多个 alias 组时，prefs 残留 key 归一可能归到先声明 alias 而筛选按后声明展开，两侧不一致致筛选语义漂移。规范碰撞场景（每 key 单 alias）不受影响。

## 契约区

### 范围

- 统一前后端「key→alias 归并」策略，使 prefs 归一与筛选展开一致；同步两侧测试。

### 非范围

- 不改 model_aliases 配置格式。
- 不引入传递闭包。
- 不重做 t384 已落地的 IN 归并展开。

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

- [ ] AC-001：multi-alias 配置（同一原始 key 出现在 ≥2 个 alias 组）下，前端 originalToAlias 对 prefs 残留 key 的归一结果与后端 resolver 展开语义一致（同一策略；可观察：筛选该 key 命中的模型集合与按该策略预期一致）。
- [ ] AC-002：单 alias（每 key 唯一组）配置下筛选与归一行为与 t384 后现状完全不变（回归）。
- [ ] AC-003：两侧策略统一后，测试断言同步锁定新语义（可区分修复前后）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（前端组件/纯函数单测 + 后端 store 单测）。

## 上下文区

- 来源：p182（t384 reviewer f002 登记；2026-08-16 核实仍待处理，描述与现状一致）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认（token-stats-store.test.ts / token_stats_view.test.tsx 现有范式）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：两侧语义哪个为准由实现自决，需保持与 t384「resolver 为准」方向一致。
- 回退：还原单侧实现。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

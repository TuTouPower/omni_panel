# Task spec

## 背景

前端 originalToAlias 先写获胜（`src/renderer/views/TokenStatsView.tsx`，`if (!map.has(m)) map.set(m, alias)`），后端 dashboard_alias_resolver 后写覆盖（`token-stats-store.ts` lookup.set，且被测试锁定）。同一 key 出现在多个 alias 组时，prefs 归一与筛选展开可能不一致。另：rollup ready 后 union 路径缺 agent+model 组合过滤与跨 model 同 session 的 sessions 去重断言（p183）。

## 契约区

### 范围

- 统一前后端「key→alias 归并」策略，使 prefs 归一与筛选展开一致；同步两侧测试。
- 在 `tests/unit/main/core/token-stats/token-stats-store.test.ts`（或同目录）补 rollup-ready union 路径用例：agent+model 组合过滤；跨 model 同 session 的 sessions 去重（COUNT(DISTINCT) / 列表无重复 session）；触达 dashboard_window_union_builder 双源路径。

### 非范围

- 不改 model_aliases 配置格式。
- 不引入传递闭包。
- 不重做 t384 已落地的 IN 归并展开。
- 不新增 store 层与 union 过滤无关的行为（union 用例只补测试，不借机改生产逻辑，除非 alias 统一所必需）。
- 不改既有用例语义（除为对齐 alias 新语义而必须改的锁定测试）。

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
- [ ] AC-004：rollup ready（is_hour_rollup_ready()=true）下 agent+model 组合过滤用例：rollup union 与 records fallback 两条路径均只返回匹配行。
- [ ] AC-005：跨 model 同 session 用例：sessions 维度去重（COUNT(DISTINCT session) / sessions 列表无重复 session）。
- [ ] AC-006：既有 token-stats 相关用例不回归（全量相关测试绿）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（前端组件/纯函数单测 + 后端 store 单测）。

## 上下文区

- 来源：p182（alias 前后端不一致）；p183（union 路径测试缺口）；merge t428+t429。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- alias：token-stats-store.test.ts / token_stats_view.test.tsx 现有范式。
- union：沿用 :2300/:2644 范式与 record() fixture；必须显式断言 is_hour_rollup_ready，避免空跑。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：两侧语义哪个为准由实现自决，需保持与 t384「resolver 为准」方向一致。
- 风险：union 用例未触达 ready 路径即空跑——须断言 ready。
- 回退：还原 alias 单侧实现；删除新增 union 用例。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

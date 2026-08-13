# Task spec

## 背景

多个连接器数值/日期解析健壮性缺口：grok `reset_at` 用 `Date.parse` 未校验 NaN，NaN 违反 schema 致整条观测丢弃；firecrawl `tokens.reset_at` 计算后未用、两条观测都复用 credits.reset_at；firecrawl 无时区日期按本地时区解析；cpa 多处 reset_at/pct/duration 未钳制/未归一（负 used、超 100% pct、string duration 不识别、reset_after_seconds NaN）；mimo balance 恒真守卫、minimax period_key 时间戳缺失误判、getoneapi code 严格比较等。

## 契约区

### 范围

- 统一数值/日期解析守卫：`Date.parse` 后 `Number.isFinite` 校验；`Number(x)` 后 isFinite；pct 钳制 `[0,100]`；duration 先 `Number()` 归一。
- 修复 firecrawl `reset_at` 分指标组装（credits/tokens 各自 reset_at），无时区日期显式按 ISO8601 处理。
- mimo `to_number` 对非数字返回 NaN 或先校验 typeof；minimax 时间戳缺失跳过周期推断；getoneapi code 用 `Number(code)` 容错。

### 非范围

- 不改连接器 API 契约本身。

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

- [ ] AC-001：不可解析的 reset_at 不再产生 NaN（置 null 而非丢整条观测）。
- [ ] AC-002：pct 值被钳制到 [0,100]，负 used/超 100% 不再出现。
- [ ] AC-003：string 型 duration_seconds 被归一识别，周期窗口语义正确。
- [ ] AC-004：非数字 balance/limit 不静默当 0（跳过或报 failed），守卫非恒真。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：各 connector 集成测试补非法值 fixture。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`grok/connector.ts:119`、`firecrawl/connector.ts:60`/`:277`、`cpa/connector.ts:204`/`:305`/`:213`/`:43`/`:355`/`:299`/`:194`/`:195`/`:356`/`:159`、`mimo/connector.ts:143`/`:155`、`minimax/connector.ts:78`/`:99`、`getoneapi/connector.ts:51`、`codex/connector.ts:165`、`deepseek/connector.ts:52`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 各 connector 测试补「非法日期/非数字 balance/超 100 pct/string duration」用例，断言输出钳制/跳过。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：钳制/跳过逻辑改变既有合法值行为。
- 回退：只对非法值分支加守卫，合法值路径不变。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

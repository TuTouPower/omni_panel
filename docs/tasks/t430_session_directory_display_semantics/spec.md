# Task spec

## 背景

rollup ready 路径 `dashboard_session_page_from_meta`（`src/main/core/token-stats/token-stats-store.ts:774-801`）按 session 聚合时 directory 取 `MAX(directory)`（:789，字典序大者）；records 路径 `materialize_session_meta` from_records=true（:723-740）取 ROW_NUMBER() 最新记录目录（:728-731）。跨多 directory 会话两条路径展示不一致。仅展示字段差异，无数字错误。spec 风险段已声明语义自决（`docs/archive/tasks/t387_token_stats_rollup_directory_join/spec.md:91`）。

## 契约区

### 范围

- 统一两条路径的 directory 展示语义为「最新记录目录」（与 records 路径一致）；同步 rollup 分支实现与测试。

### 非范围

- 不改会话/记录聚合数字。
- 不改分页行为。
- 不改 directory 存储。

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

- [ ] AC-001：rollup ready 路径下跨多 directory 会话的 directory 展示与 records 路径一致（取最新记录目录）。
- [ ] AC-002：单 directory 会话展示不变（回归）。
- [ ] AC-003：dashboard_session_page_from_meta 分页与会话计数不受影响（与改动前一致）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（store 层 fixture 构造跨 directory 会话）。

## 上下文区

- 来源：p184（t387 reviewer f002 登记；2026-08-16 核实仍待处理，描述与现状一致；spec 风险段已声明语义自决 `docs/archive/tasks/t387_token_stats_rollup_directory_join/spec.md:91`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按 token-stats-store.test.ts 现有 fixture 范式，构造同 session 多 directory 记录（records 路径）与 meta 路径对照。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- rollup 数据是否保留记录级时间戳以取「最新」：UNVERIFIED-SPIKE，实现侧核实；若 rollup 分组丢失时间维度，方案须说明如何取最新。

### 风险与回退

- 风险：rollup 路径无时间戳时取最新目录的实现复杂度。
- 回退：保留 MAX 语义。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

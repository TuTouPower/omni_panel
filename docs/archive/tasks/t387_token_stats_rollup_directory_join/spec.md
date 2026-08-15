# Task spec

## 背景

token-stats rollup ready 路径：`materialize_session_meta` from_records=false 分支按 `GROUP BY source, env, session_id, directory` 建 session_meta（token-stats-store.ts:608-620），同一 session 跨多 directory（罕见，session 通常绑定单 transcript 目录）时建多行；`read_rollup_from_window_rows`（:701-722）LEFT JOIN ON 只含 source/env/session_id（:706-708），window_rows 每行与该 session 全部 session_meta 行相乘放大 SUM。复验（.scratch/p171_repro.test.ts）：同 session 两目录（input 10+20+5=35 tokens 口径）rollup ready 输出 460=230×2，records 路径 230 正确。t351 AC-002 引入 from_records 分支。p171 已核实（2026-08-15）。

## 契约区

### 范围

- `src/main/core/token-stats/token-stats-store.ts`：修复 `read_rollup_from_window_rows` 的 LEFT JOIN 放大——同 session 跨多 directory 时 window_rows 每行只匹配一行 session_meta（方案自选：JOIN 键补 directory、或 join 前对 session_meta 按 session 归一去重取一目录、或按行级区分）。
- 验证 `dashboard_session_page_from_meta`（会话列表重复）随修复自动消失。

### 非范围

- records 路径（无此放大，不动）
- rollup 的其它查询（query_range_rollup/metric_buckets/session_buckets/heatmap 均直读 window_rows/records、无 session_meta JOIN、无放大）
- emitted 去重（t386）与扫描原子性（t385）

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

- [ ] AC-001：跨多 directory 会话 rollup 汇总正确——同 session 跨两 directory，rollup ready 路径 `SUM(calls)`/`SUM(tokens)` == records 路径（对比修复前翻倍 460 vs 230）。
- [ ] AC-002：单 directory 会话行为不变——既有 dashboard rollup 测试（s1/s2/s3/s4 各绑单目录）全绿，输出与修复前一致。
- [ ] AC-003：会话列表不重复——同 session 跨多 directory，`dashboard_session_page_from_meta` 会话列表只出现该 session 一次（对比修复前重复）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：token-stats-store.test.ts 用真实 sqlite fixture 构造同 session 跨两 directory，断言 rollup ready 与 records 路径汇总一致、会话列表去重。

## 上下文区

- 来源：p171（`docs/pending/todo/p171_token_stats_session_directory_rollup_sum.md`；2026-08-15 子代理核实 + `.scratch/p171_repro.test.ts` 复验 460 vs 230；已扫无其它独立放大位点）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `tests/unit/main/core/token-stats/token-stats-store.test.ts`：补「同 session 跨两 directory」用例，同时走 rollup ready 与 records 两条读路径断言汇总一致（对齐既有 dashboard aggregate read path 用例结构）；补 `dashboard_session_page_from_meta` 会话列表去重断言（AC-003）。
- 可复用 `.scratch/p171_repro.test.ts` 的复验思路迁入正式测试。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：JOIN 修复方案选择（补 directory 键 vs 归一去重）影响「同 session 多 directory 该取哪个 directory 归属」的语义，可能影响按 directory 维度的展示；会话列表去重修复牵连 dashboard_session_page_from_meta 回归。
- 回退：git 回退；AC-002 既有用例锁定单目录行为，AC-001/AC-003 锁定新语义。

### 依赖与约束

- 无前置依赖。实现约束：不改 records 路径；JOIN 修复须保持窗口裁剪语义不变。

### Finalization 时更新的 blueprint

- 无

# Task spec

## 背景

`chart-data.ts` 同一聚合逻辑按 records/buckets/rollup/dashboard 三到四套并行镜像复制：agent 显示名映射 3 份、Top5+其他 segment 构建 3 份、composition segment 3 份，同步仅靠注释 "mirrors" 约束。另有去重键不一致（kpiFromRollup 用裸 session_id，rollup 用 `source|env|session_id`）、O(records×N) 线性扫描、colorOf 死分支。

## 契约区

### 范围

- 抽公共生成器（如 `top_segments(entries, valueFn, labelFn, colorFn)`），四份入口只做数据源适配。
- `kpiFromRollup` 改用 `rollup_session_key` 去重（提升为非私有导出）。
- `prepareBarData` 的 session/project 轴预构建 Map，避免 `findIndex`/`indexOf` 线性扫描。
- 删除 `colorOf` 死分支。

### 非范围

- 不改图表最终呈现语义。

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

- [ ] AC-001：agent 显示名映射/Top5+其他/composition segment 收敛为单一生成器，chart-data 内不再有镜像复制。
- [ ] AC-002：KPI 面板 sessions 计数与 donut/会话轴聚合数一致（按 `source|env|session_id` 去重）。
- [ ] AC-003：重构后 chart-data 既有单测全通过（行为不回归）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：chart-data 既有单测覆盖各入口输出一致性。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`chart-data.ts:42`、`:927`、`:228-237`、`:285`、`:1106-1110`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 复用 chart-data 既有 fixture，断言重构前后四个入口输出相同；补 kpiFromRollup 去重键一致性用例。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：抽象生成器与某一入口的隐式差异（如标签顺序）被抹平。
- 回退：生成器参数化 label/value/color 函数，差异处由入口适配层保留。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

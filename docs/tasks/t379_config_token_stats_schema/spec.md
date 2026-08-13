# Task spec

## 背景

`AppConfiguration.tokenStats` 是「类型声明但持久化 schema 剥离、全仓无写入方」的假字段：`appConfigurationSchema`（`config/types.ts`）未含 `tokenStats`，zod object 默认 strip 未知键，每次 load/save/import 都静默丢弃该块。唯一读取方 `build_token_stats_config` 恒取默认值（`wsl_enabled:true`、`poll_interval_ms:600000`、`wsl_distro:"Ubuntu-22.04"`），WSL/轮询配置无法持久化；导入含 tokenStats 的配置静默丢失该块。

## 契约区

### 范围

- 把 `tokenStats` 子对象加入 `appConfigurationSchema`（与类型对齐），或从类型删除该字段并让 index.ts 读专用配置源。

### 非范围

- 不改 token-stats 调度逻辑。

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

- [ ] AC-001：tokenStats 配置经 load/save 后不再被 strip 丢失（或类型字段被移除）。
- [ ] AC-002：含 tokenStats 的配置导入后该块保留，`build_token_stats_config` 读取到持久化值。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：config-store 单测（save→load 断言 tokenStats 保留）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`config.ts:95-100`、`config/types.ts:95`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- config-store 单测：写入含 tokenStats 的 config，断言 load 后字段保留且 build_token_stats_config 读取到。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：加 schema 后需确认 tokenStats 字段结构（当前无写入方，字段形态待定）。
- 回退：若 tokenStats 确实废弃，从类型与 index.ts 读取处一并移除，避免假字段残留。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

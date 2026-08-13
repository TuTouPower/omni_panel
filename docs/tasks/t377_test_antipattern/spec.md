# Task spec

## 背景

多处测试假绿/反模式：(1) codex-day-key 测试内联复制生产实现而非触达生产代码；(2) deepseek/claude 连接器测试手工复制 manifest 而非读真实 manifest；(3) glm 测试用源码文本断言（`script.indexOf` 找 throw 语句）；(4) WorkspaceView 滚动测试弱断言（jsdom scrollTop 恒 0 恒真）；(5) VirtualMessageList 核心组件无直接单测；(6) token_stats_baseline 生成 60 万条合成记录拖慢套件；(7) minimax 关键分支无覆盖；(8) route_api/App/CpaLabelMapDialog/AccountDialog 等无直接单测。

## 契约区

### 范围

- day_key 提取为可 import 共享模块，测试触达生产代码；或补跨月边界生产路径用例。
- 连接器测试改从磁盘加载真实 manifest。
- 删 glm 源码文本断言，改行为断言。
- 修 WorkspaceView 弱断言（显式 scrollTop 定义 + 负向断言）。
- 为 VirtualMessageList 补组件测试（mock scrollElement，断言 prepend 补偿/scrollToId）。
- baseline 长度断言降到 10^4~10^5 量级。
- minimax 补表驱动分支覆盖。

### 非范围

- 不改生产行为语义。

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

- [ ] AC-001：day_key/manifest 相关测试触达生产代码，生产侧回归可被捕获。
- [ ] AC-002：删除源码文本断言，行为断言替代。
- [ ] AC-003：VirtualMessageList 有组件级测试覆盖 prepend/scrollToId。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：既有测试改造后运行。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`codex-day-key.test.ts:11`、`deepseek-connector.test.ts:9-34`、`claude-connector.test.ts:9`、`glm-connector.test.ts:177`、`WorkspaceView.test.tsx:452`、`VirtualMessageList.tsx:31`、`token_stats_baseline.test.ts:19`、`minimax-connector.test.ts:184`、`TrendSparkline.tsx:185`/`:60`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 纯 jsdom 布局限制的滚动行为以显式 scrollTop mock 覆盖，不做真实布局。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 提取 day_key 共享模块；connector 测试读真实 manifest；VirtualMessageList mock scrollElement。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：提取 day_key 模块需 VM 注入，改动连接器编译。
- 回退：若 VM 注入复杂，先在集成测试补跨月边界生产路径用例。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

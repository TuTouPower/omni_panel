# Task spec

## 背景

net-client 超时/错误分类缺陷：(1) 请求超时经 AbortController abort 产生的错误消息无 "timeout" 字样，下游 `is_timeout_error`/`is_connection_error` 都不命中，连接错误计数归零、重试分类与用户文案失真；(2) 4xx/5xx 错误响应仍读满 50MB body 仅为取长度后丢弃，浪费带宽内存。

## 契约区

### 范围

- abort 前先置超时标志或 reject 用明确的超时错误消息（含 "timeout"/"timed out"）。
- 错误路径改用小上限（如 1MB）读取或直接 `response.body.destroy()` 丢弃，长度仅从 content-length 头取。

### 非范围

- 不改请求/重试策略本身。

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

- [ ] AC-001：超时错误可被 `is_timeout_error` 识别（含 timeout 字样）。
- [ ] AC-002：4xx/5xx 错误响应不再读满大 body（小上限或 destroy）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：net-client 单测（mock 超时/大错误响应）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`net-client.ts:231`/`:200`/`:218`/`:286`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- net-client 单测：mock abort 断言错误消息含 timeout；mock 4xx 大 body 断言读取有上限。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：错误 body 上限过低丢失诊断信息。
- 回退：上限取 1MB（足够日志），长度从 content-length 头补全。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

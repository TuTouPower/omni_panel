# Task spec

## 背景

`echarts_token_resolver.ts` 的 `agent_color()`/`top_category_color()` 每次调用都完整重建整个 ChartPalette（约 30 次 `resolved_token` → `getComputedStyle`），渲染路径逐行/逐 segment 反复触发，一次图表渲染产生几十次 palette 重建，整帧被样式计算拖慢。`use_chart_palette` 已用 revision 监听模式，但取色函数未复用缓存。

## 契约区

### 范围

- 给 `resolve_chart_palette` 加按 `(theme, revision)` 的模块级缓存，`agent_color`/`top_category_color` 改为复用缓存 palette。
- 或改调用方一次性 `palette_for(theme)` 后取值传入。

### 非范围

- 不改 palette 的 token 解析规则本身。

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

- [ ] AC-001：同一 (theme, revision) 下 palette 只构建一次，`agent_color`/`top_category_color` 复用缓存，不再每次调用重建。
- [ ] AC-002：主题切换（revision 变化）时 palette 缓存正确失效并重建。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：单测断言同一 revision 下 getComputedStyle 调用次数有界、revision 变化后重建。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`echarts_token_resolver.ts:396`、`:392`、`:108`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock `getComputedStyle`/`resolved_token`，断言 palette 构建次数；模拟 revision 递增断言缓存失效。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：缓存 key 遗漏某一 palette 输入导致脏缓存。
- 回退：缓存 key 用 `(theme, revision)` 完整标识，revision_listeners 已能感知主题变化。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

# Task spec

## 背景

token-stats 测试与渲染层 4 条 minor 遗留合并（t347/t349/t350/t379 review 遗留）：p168 的 token-stats manager 测试精化（末批 `rebuild_buckets=true` 未显式断言、熔断测试 fake timers 未 try/finally 隔离、`is_running()` 不可区分 stopped/tripped）；p169 的 `prepareBarDataFromRollup` 轴 `ranked.findIndex`/`dirs.indexOf` 仍线性扫描（rollup rows 有界几百，量级可接受）；p170 的 chart palette 缓存 key 不含 root（root 仅首次构建生效，当前全部调用方走默认 documentElement 无实际错误）；p178 的 `build_token_stats_config` 是未导出闭包、读取持久化值无直接单测。均为测试精化 + 渲染层小修。

## 契约区

### 范围

- token-stats manager 测试：末批 `rebuild_buckets=true` 显式断言；熔断测试 fake timers 用 try/finally 隔离；暴露「stopped vs tripped」可观察状态（API 或探针）并断言
- `src/renderer/lib/token-stats/chart-data.ts`：`prepareBarDataFromRollup` 轴查找改预构建 Map（与 prepareBarData 一致）
- `src/renderer/lib/echarts_token_resolver.ts`：palette 缓存 key 纳入 root（或删 root 参数、或文档注明 root 仅作构建上下文）——三选一消除 latent 陷阱
- `src/main/core/token-stats/`（或配置构建处）：`build_token_stats_config` 抽导出并补单测（wsl/poll 默认值 + 持久化值分支）

### 非范围

- token-stats 查询/聚合行为变更
- dashboard 读取路径（t387 独立）
- 其它渲染组件重构

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

- [ ] AC-001：末批 rebuild 断言——多批流程测试显式断言末批 `rebuild_buckets=true`（对比现在批次测试仅隐含覆盖）。
- [ ] AC-002：熔断状态可观察——token-stats manager 可区分「已停止」与「已熔断」状态，熔断测试断言该区分；fake timers 用 try/finally 隔离不污染全局。
- [ ] AC-003：rollup 轴查找 Map 化——`prepareBarDataFromRollup` 的 session/project 轴查找不再线性 `findIndex`/`indexOf`，与 `prepareBarData` 一致用预构建 Map；输出不变。
- [ ] AC-004：palette key 含 root——`resolve_chart_palette` 缓存 key 纳入 root 签名（或删 root 参数），不同 root 不命中同一缓存条目；现有调用方行为不变。
- [ ] AC-005：config 构建可测——`build_token_stats_config` 抽导出，单测覆盖 wsl/poll 默认值与持久化值读取分支。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：manager 测试、chart-data 测试、palette 测试、config 构建单测覆盖。

## 上下文区

- 来源：p168 / p169 / p170 / p178（`docs/pending/todo/`；2026-08-13 登记，t347/t349/t350/t379 review 遗留；p169 量级可接受、p170 无实际错误，均 minor）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- p170 若选「文档注明 root 仅作构建上下文」方案：root 不同 root 的缓存命中差异不写测试（当前无调用方传非默认 root），仅文档说明——由 reviewer 确认非 blocking。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- manager 测试：多批流程补末批 rebuild 断言；熔断用例补 stopped/tripped 区分断言 + fake timers try/finally。
- chart-data：rollup 轴 Map 化后输出断言不变（既有用例保持绿）。
- palette：不同 root 的缓存 key 隔离用例（若选 key 含 root 方案）。
- config：build_token_stats_config 导出后补默认值 + 持久化值分支单测。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：`build_token_stats_config` 抽导出暴露内部闭包可能改行为；palette key 含 root 后缓存条目语义变化（但 revision 已防累积）。
- 回退：git 回退；AC-003 输出不变由既有用例锁定，AC-004 现有调用方由行为断言锁定。

### 依赖与约束

- 无前置依赖。实现约束：输出行为不变（Map 化/缓存 key 调整均不改变渲染结果）；`build_token_stats_config` 导出不改变读取语义。

### Finalization 时更新的 blueprint

- 无

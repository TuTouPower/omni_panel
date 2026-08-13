# Task spec

## 背景

连接器结构/阈值/窗口语义 + poll 死配置：(1) kimi「5 小时限额」取 `limits[0]` 但不校验 `window.duration===300`，注释声称的选择准则未实现；(2) kimi 周用量 `window:"day"` 与 7 天周期错位；(3) glm 5h 观察 `window:"second"` 与 5h 周期不符；(4) opencode_go fallback 用 `Promise.race` 任一 bundle 失败即整体中止，且要求三窗口齐全；(5) firecrawl 两接口 `Promise.all` 部分失败整体失败；(6) 多个 manifest（getoneapi/glm/tavily/firecrawl/minimax）声明 `poll` 段与 script 并存，poll 是死配置；(7) claude 脚本硬编码 credentials 路径，manifest data_dir 契约失效。

## 契约区

### 范围

- kimi 按 `rate_limit.window?.duration === 300`（或按 duration 动态映射窗口）选窗；周用量 window 改 "week"。
- glm 5h 观察 window 改 "day"（或明确该字段仅展示并注释）。
- opencode_go fallback 改用 `Promise.allSettled` 容忍失败 bundle，仅返回已解析窗口。
- firecrawl 改用 `Promise.allSettled`，成功侧照常产出 observation，失败侧 `report_failed_account`。
- 删除 script 型 manifest 的 poll 死配置段（保留 capabilities），或 runtime 对 script+poll 并存报配置错误。
- claude 脚本读 `ctx.params["data_dir"]`，与 manifest 契约一致。

### 非范围

- 不改各连接器对外指标语义。

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

- [ ] AC-001：kimi 限额窗口按 duration 校验选择，duration 非 300 不产出 five_hour。
- [ ] AC-002：firecrawl 单接口失败不拖垮另一接口，成功侧照常产出。
- [ ] AC-003：opencode_go fallback 单 bundle 失败不影响其余 bundle 产出。
- [ ] AC-004：claude 脚本读取 data_dir 参数，设置 data_dir 生效。
- [ ] AC-005：script 型 manifest 的 poll 死配置段被移除或运行时明确拒绝。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：各 connector 集成测试补 duration/部分失败/data_dir/poll 用例。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`kimi/connector.ts:113`、`kimi/connector.ts:328`、`glm/connector.ts:119`、`opencode_go/connector.ts:397-400`/`:423`/`:330`、`firecrawl/connector.ts:59`、`getoneapi/manifest.json:26-33`、`glm/manifest.json:18`、`tavily/manifest.json:18`、`firecrawl/manifest.json:18`、`minimax/manifest.json:18`、`claude/connector.ts:49`、`claude/manifest.json:32`、`kimi/manifest.json:33`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 各 connector 测试补表驱动用例：duration=60/300、单接口 5xx、data_dir 自定义路径、poll 段移除后 script 仍执行。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：删 poll 段后若有依赖 poll 的自建连接器受影响。
- 回退：只删 script 与 poll 并存的死段；纯 poll 连接器（无 script）保留 poll 段。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

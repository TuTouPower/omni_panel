# Task spec

## 背景

21个内置连接器全部带`script: connector.ts`，`execute_connector`（`src/main/core/scheduler/refresh-service.ts:285`）先判script，导致`:315` poll分支与`:317` probe分支零命中。带poll段8家（commandcode/cpa/deepseek/exa/grok/grok_bot/kimi/tikhub）`poll.map`全为`{}`；21家全无observe段；5家（firecrawl/getoneapi/glm/minimax/tavily）`capabilities:['poll']`却无poll段（`manifest.ts:104` refine放行，转为诚实性问题）；3家local（antigravity/claude/codex）与5家session（muse/mimo/flowercloud/kimi_web/opencode_go）均无独立executor，执行仍走脚本。现行`execute_poll`仅支持`$.a.b.c`单观测used/limit，无法表达真实脚本逻辑（firecrawl双端点arithmetic与per-metric reset_at、tavily条件breakdown、deepseek数组fan-out）。用户决策：架构最干净优先，不做旧兼容，不限开发成本。结论：废弃声明式执行路径，收敛为脚本唯一执行模型，删除死代码与虚标。

## 契约区

### 范围

- 删除`src/main/core/connector/tier1-poll-executor.ts`与`probe-executor.ts`，清理全部引用与对应单测。
- `src/shared/schemas/manifest.ts`删除`poll`/`observe`/`local`段、`capabilities`字段及refine（含t363 AC-005注释），保留`id/provider/parameters/endpoints/script/auth/loginDomains/cookieNames`；strict拒收旧字段。
- `refresh-service.ts`的`execute_connector`简化为script唯一路径：无script直接抛`has no executable capability`类明确错误（含connector id）；删除`poll?.request.auth?.secret`注入分支。
- 21个`connectors/*/manifest.json`删除`capabilities/poll/observe/local`键，保留其余键原值。
- 更新引用上述模块的测试与文档索引。

### 非范围

- 不改任何`connector.ts`业务逻辑。
- 不动`exposeToScript`与`grok_billing`特例（t542）。
- 不新增声明式DSL能力，不新增local/session executor。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：无script的manifest执行刷新时直接抛错，错误信息含connector id，不再尝试poll/probe分支。
- [ ] AC-002：仓库内无`tier1-poll-executor`与`probe-executor`文件，且`rg`无生产代码引用残留。
- [ ] AC-003：含`poll`/`observe`/`local`/`capabilities`任一键的manifest经`manifest_schema`校验失败（strict未知键报错）。
- [ ] AC-004：21个内置manifest均无`poll`/`observe`/`local`/`capabilities`键且全部通过新schema校验。
- [ ] AC-005：21个连接器定义可正常discover加载；刷新冒烟中脚本路径仍产出与改前一致的observation结构（字段集不变）。
- [ ] AC-006：firecrawl/tavily/deepseek既有连接器单测在唯一脚本路径下全部通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p273（2026-09-30只读核实：21对21 script对应、8空poll.map、0 observe段、5虚标poll、3 local+5 session无executor；证据`.scratch/tier1_declarative_landing/evidence.md`）+用户2026-09-30决策（最干净架构、不兼容旧路径、合并为2 task）

### 有意不测

- 旧manifest前向兼容：不测原因：用户明确不做旧兼容，旧字段直接拒收。
- 各脚本业务语义回归全量：不测原因：脚本零改动，仅执行分发简化，由AC-006抽样覆盖。

### 测试策略

- zod schema负向单测：旧四键逐个拒收断言。
- `rg`断言删除无残留：执行器文件与导入引用。
- 21 manifest批量校验脚本：无旧键且parse通过。
- 既有连接器vitest抽样：firecrawl/tavily/deepseek。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：第三方用户自定义连接器（t095）依赖poll/observe声明式路径被直接拒收。
- 回退：用户已接受不兼容；回退即`git revert`本task执行commit，恢复四键schema与两执行器。

### 依赖与约束

- 无前置依赖；与t542同改`manifest.ts`/`refresh-service.ts`/21 manifests，t542须后做。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：连接器运行时章节删除poll/probe执行描述，改为脚本唯一路径。
- `docs/blueprint/decisions.md`：新增声明式路径废弃决策条目。

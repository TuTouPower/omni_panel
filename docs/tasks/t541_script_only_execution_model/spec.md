# Task spec

## 背景

21个内置连接器全部带`script: connector.ts`，`execute_connector`（`src/main/core/scheduler/refresh-service.ts:285`）先判script，导致`:315` poll分支与`:317` probe分支对这21家零命中。8家`poll.map`全为`{}`，21家全无observe段（`.scratch/tier1_declarative_landing/evidence.md`）。但分支走不到不等于这些键无读者：`poll.request.auth`仍被`net-client.ts:238 apply_request_auth`读走（Grok/Grok Bot的Bearer注入）、`refresh-service.ts:256`据此向params补secret；`local.paths`是`ctx.files.read/list`（`net-client.ts:753/:767`）的允许目录沙箱边界（Claude/Codex在用）；`capabilities`被`src/main/ipc/connector-ipc.ts:34-38`推出source、`refresh-service.ts:715`触发session自动重登、`src/renderer/lib/auth-flow-registry.ts:25-29`回退添加账号表单（MiMo/Claude/Codex/Antigravity无auth段，靠capabilities）。结论修正：只删真正死亡的执行路径与无auth空poll，活字段保留并去“执行器”伪装。

## 契约区

### 范围

- 删除`src/main/core/connector/tier1-poll-executor.ts`与`probe-executor.ts`，删除`execute_connector`内poll/probe两条分发分支，清理全部引用与对应单测。
- 删除`observe` schema段（strict拒收），21家本就无observe段，无manifest改动。
- 删除6家无auth空poll段（commandcode/cpa/deepseek/exa/kimi/tikhub：仅path无auth，执行与鉴权均无读者）。
- Grok/Grok Bot的`poll.request.auth`挪成宿主鉴权声明（字段名实现期定）：`apply_request_auth`的Bearer注入行为与`refresh-service.ts:256`的params补secret行为保持不变；两家脚本所用端点名仍由manifest声明。
- `local.paths`原样保留，仅去除“local是一种执行器”的文档/注释表述，不改allowlist语义。
- `capabilities`字段原样保留，不动source推导、重登条件与表单回退。

### 非范围

- 不改任何`connector.ts`业务逻辑与observation结构。
- 不动`capabilities`/`local.paths`的读取语义（source、重登、表单、文件沙箱）。
- 不动`exposeToScript`与`grok_billing`特例（t542）。
- 不新增声明式DSL能力，不新增local/session executor。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：执行器文件已删除，生产代码`rg`无`tier1-poll-executor`/`probe-executor`引用；`execute_connector`无script manifest直接抛错（含connector id），不再有poll/probe分支。
- [ ] AC-002：含`observe`键的manifest经`manifest_schema`校验失败；21个内置manifest全部通过新schema校验。
- [ ] AC-003：6家无auth空poll段已删除且校验通过；其刷新仍走脚本路径，observation字段集与改前一致。
- [ ] AC-004：Grok与Grok Bot请求仍带Bearer：mock端点断言`Authorization: Bearer <token>`（脚本自身不拼接该头，行为由宿主注入保持）。
- [ ] AC-005：Claude/Codex允许路径内`ctx.files.read/list`仍成功，路径外仍抛`not allowed`类错误。
- [ ] AC-006：5个session连接器（muse/mimo/flowercloud/kimi_web/opencode_go）鉴权失败仍触发自动重登。
- [ ] AC-007：MiMo添加账号仍走session表单，Claude/Codex/Antigravity仍走本地CLI表单（与改前一致）。
- [ ] AC-008：firecrawl/tavily/deepseek既有连接器单测在脚本路径下全部通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p273（2026-09-30只读核实：21对21 script对应、8空poll.map、0 observe段；证据`.scratch/tier1_declarative_landing/evidence.md`）+用户2026-09-30修正（活读者：net-client auth注入、files allowlist、capabilities三处；错推论：走不到≠无读者）+本次2026-09-30复核（`apply_request_auth` bearer注入、`files.read/list` allowlist、`source_from_definition`/重登/表单回退、Grok空parameters、2家有auth poll vs 6家无auth poll）

### 有意不测

- 旧`observe`/执行器前向兼容：不测原因：用户明确不做旧兼容，旧字段直接拒收。
- 全量21脚本端到端刷新：不测原因：脚本零改动，由AC-003/AC-004/AC-008抽样覆盖。

### 测试策略

- zod schema负向单测：`observe`拒收、无auth空poll删除后parse通过。
- `rg`断言删除无残留：两执行器文件与导入引用。
- Bearer注入集成单测：Grok/Grok Bot mock端点断言Authorization头。
- files allowlist单测：允许内外路径正反断言。
- session重登与表单回退：既有单测保持通过为凭。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：第三方用户自定义连接器（t095）依赖poll/observe声明式路径被直接拒收。
- 回退：用户已接受不兼容；回退即`git revert`本task执行commit。

### 依赖与约束

- 无前置依赖；与t542同改`manifest.ts`/`refresh-service.ts`及部分manifest，t542须后做。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：Tier1段改写为“声明式执行器已删除；poll.request.auth为宿主鉴权声明，local.paths为文件沙箱边界，capabilities为来源/重登/表单信号”。
- `docs/blueprint/decisions.md`：新增执行路径删除决策条目（含保留活字段的理由）。

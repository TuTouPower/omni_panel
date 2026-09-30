# Task spec

## 背景

21个内置连接器全部带`script: connector.ts`，`execute_connector`（`src/main/core/scheduler/refresh-service.ts:285`）先判script，`:315` poll与`:317` probe分支对这21家零命中；8家`poll.map`全`{}`，21家无observe段。但分支走不到≠无读者：`poll.request.auth`被`net-client.ts:238 apply_request_auth`读走做Bearer注入（Grok/Grok Bot，两脚本均不自拼Authorization；Grok `parameters: []`，token只走此链），`refresh-service.ts:256`据此补params；`local.paths`是`ctx.files.read/list`（`net-client.ts:753/:767`）allowlist沙箱边界；`capabilities`被`connector-ipc.ts:34-38`推source、`refresh-service.ts:715`触发session重登、`auth-flow-registry.ts:25-29`回退添加账号表单。复核另发现：`observe`清理若只删schema段必撞编译错（capability枚举`manifest.ts:15`、refine分支`:105`、`connector-ipc.ts:37`三处残留）；`poll.request`移走auth后剩余endpoint/path/method/map全变死数据，应整段删；`ObservationSource`的`"probe"`类型须保留（历史数据与`runtime.ts:217`校验）。

## 契约区

### 范围

- 删除两执行器文件与`execute_connector`内poll/probe分发分支，清理全部引用与对应单测。
- `manifest.ts`：删除`poll`/`observe` schema段（strict拒收）；capability枚举删除`"observe"`值；refine删除observe分支，poll分支改为仅校验script存在（t363 AC-005注释语义作废）；删除`connector-ipc.ts:37`的observe→probe映射分支。
- 新增顶层`host_auth`宿主鉴权声明，语义写死：`{ endpoint: string; type: "bearer" | "header" | "query"; secret: string; header_name?: string; query_param?: string }`；作用于该连接器经NetClient发往所声明端点的请求（Grok→`grok_billing`，Grok Bot→`cursor_api`；两脚本各自只调单一端点，行为与现状逐请求注入等价）；`refresh-service` params补secret沿用同一声明；严禁复用`manifest.auth.secret_name`（session系`web_login`的SESSION_COOKIE会被无差别注入Bearer）。
- 8家`poll`段整段删除；Grok/Grok Bot的`poll.request.auth`迁移为`host_auth`（端点条目保留在`endpoints`）。
- `local.paths`与`capabilities`（`poll`/`local`/`session`值）原样保留；`ObservationSource`的`"poll"`/`"probe"`类型与source默认映射（除observe分支外）保留。
- 受影响测试fixture同步迁移：`tests/integration/scheduler/refresh-service.test.ts`（:100 deepseek poll、:563 grok poll+auth、:2028 firecrawl poll等含poll段fixture）、`tests/unit/scheduler/refresh-service.test.ts:507-524` oauth fixture（poll+capabilities）、`tests/integration/connector/grok_connector.test.ts`（`poll.request`断言改`host_auth`）。

### 非范围

- 不改任何`connector.ts`业务逻辑与observation结构（含脚本自写`source`）。
- 不动`capabilities`读取语义（source推导、重登、表单）、`local.paths` allowlist语义。
- 不动`exposeToScript`与`grok_billing`特例（t542）。
- 不新增声明式DSL能力，不新增local/session executor。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：执行器文件已删除，生产代码`rg`无`tier1-poll-executor`/`probe-executor`引用；`execute_connector`无script manifest直接抛错（含connector id），无poll/probe分支。
- [ ] AC-002：含`poll`/`observe`键或`capabilities`含`"observe"`的manifest经`manifest_schema`校验失败；21个内置manifest全部通过新schema校验；`pnpm typecheck`通过（无observe残留编译错）。
- [ ] AC-003：8家`poll`段已删除；Grok/Grok Bot的`host_auth`声明存在且端点名与脚本调用一致；其余6家无残留鉴权声明。
- [ ] AC-004：Grok与Grok Bot请求仍带Bearer：mock端点断言`Authorization: Bearer <token>`（脚本自身不拼接该头）；session系连接器请求不因`host_auth`多出Authorization头。
- [ ] AC-005：Claude/Codex允许路径内`ctx.files.read/list`仍成功，路径外仍抛`not allowed`类错误。
- [ ] AC-006：5个session连接器（muse/mimo/flowercloud/kimi_web/opencode_go）鉴权失败仍触发自动重登。
- [ ] AC-007：MiMo添加账号仍走session表单，Claude/Codex/Antigravity仍走本地CLI表单（与改前一致）。
- [ ] AC-008：firecrawl/tavily/deepseek/grok既有连接器单测在脚本路径下全部通过。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p273（2026-09-30只读核实；证据`.scratch/tier1_declarative_landing/evidence.md`）+用户2026-09-30修正（活读者三组）+审阅2026-09-30（observe三件套、host_auth语义留白、poll残余、fixture范围、文档真相源）+本次复核（`manifest.poll`读者：net-client:238/refresh:256/:315/执行器；`manifest.observe`读者：执行器/refresh:317/schema:105；`connector-ipc:37`；两脚本单端点调用；`ObservationSource` probe保留点：observation.ts:11/plugin-output.ts:33/runtime.ts:217/registry:31）

### 有意不测

- 旧`poll`/`observe`/执行器前向兼容：不测原因：用户明确不做旧兼容，旧字段直接拒收。
- 全量21脚本端到端刷新：不测原因：脚本零改动，由AC-003/AC-004/AC-008抽样覆盖。

### 测试策略

- zod schema负向单测：`poll`/`observe`键拒收、`capabilities:["observe"]`拒收。
- `rg`断言删除无残留：两执行器文件、导入引用、observe映射分支。
- Bearer注入集成单测：Grok/Grok Bot mock端点断言Authorization头；session系反向断言无新增头。
- files allowlist单测：允许内外路径正反断言。
- 上述fixture文件同步迁移后相关套件全绿。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：第三方用户自定义连接器（t095）依赖poll/observe声明式路径被直接拒收；`host_auth`为新契约，旧`poll.request.auth`写法失效。
- 回退：用户已接受不兼容；回退即`git revert`本task执行commit。

### 依赖与约束

- 无前置依赖；与t542同改`manifest.ts`/`refresh-service.ts`及部分manifest，t542须后做；t542的`protectedEndpoints`叠加在`host_auth`之外，两声明正交。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：Tier1段改写为“声明式执行器与poll/observe段已删除；`host_auth`为宿主鉴权声明，local.paths为文件沙箱边界，capabilities为来源/重登/表单信号”。
- `docs/blueprint/decisions.md`：新增执行路径删除决策条目（含保留活字段与t363 AC-005作废）。
- `docs/blueprint/conventions.md`：Grok节`poll.request.auth.secret`表述改`host_auth`（端点安全句保留，措辞移交t542）。
- `docs/guides/custom-connector.md`：删除poll/observe能力文档与示例（含字段表`poll.request`/`poll.map`行、capabilities枚举行）。

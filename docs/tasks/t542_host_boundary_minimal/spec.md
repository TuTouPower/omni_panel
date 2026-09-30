# Task spec

## 背景

内置34处`exposeToScript`全为true（`connectors/`内计数；全仓143含测试fixture与schema定义，p273正文“全仓统计”措辞待修正），对21家无区分度；但schema默认仍是false（`manifest.ts:24`），删flag等于自定义连接器（t095）失去逐参隔离，secret一律进脚本沙箱。用户已选不兼容旧路径，此半可做，但须诚实记为“内置无区分度、门闩改为隔离进程”，不得写成“flag不是安全边界”。另一半：`refresh-service.ts:265-266`的`provider==="grok"`删除`endpointOverrides["grok_billing"]`是安全控制（`conventions.md:148`；`tests/integration/scheduler/refresh-service.test.ts:542-586`断言官方主机1次、攻击者主机0次且Authorization仍为Bearer；`SettingsForm.tsx`对grok藏端点输入），改成原文透传等于改成漏洞。干净做法：provider字面量收成manifest声明的受保护端点，宿主按声明丢弃覆盖。另复核：`provider === "grok"`在`src/main/index.ts:427`（OAuth分发）与`provider-usage.ts:240`（展示排序）系合法分支，不得误伤；隔离子进程与宿主共用同一`endpoint_overrides`（`isolated-process-runner.ts:321`透传），故执行点唯一。

## 契约区

### 范围

- `manifest.ts`删除`parameter_schema`的`exposeToScript`字段，strict拒收旧键。
- `build_params`删除`exposeToScript`过滤：secret一律经vault/instance key解析，非secret走配置值；`required`缺值仍抛`MissingRequiredSecretError`（含中文label）；`***`脱敏日志保持。
- 21个`connectors/*/manifest.json`删除全部`exposeToScript`键，参数名/类型/required/label原值保留。
- manifest新增顶层`protectedEndpoints: string[]`（可选，缺省空）：Grok manifest声明`["grok_billing"]`；宿主在`refresh-service`组装`endpoint_overrides`处（现:264-267）丢弃受保护端点的实例覆盖并记日志；删除`provider === "grok"`特例。信任边界：仅内置manifest受信（t515 SHA-256完整性清单），自定义连接器自声明不受保护语义约束（decisions如实记录）。
- 全仓测试fixture/断言同步：去键（`tests/e2e/fixtures/seeded_plugin.ts:39`、integration各连接器fixture：exa/firecrawl/getoneapi/kimi/mimo/glm/grok_bot/tikhub/cpa/tavily/opencode_go/discovery-cache、integration scheduler fixture群、unit scheduler fixture群、`manifest-loader.test.ts:12`、`connector-ipc.test.ts:20`、`config-ipc.test.ts:1352-1358`、`auth-ipc.test.ts:52`、`import-config.test.ts:36-37`）；改断言（`manifest-contract.test.ts:41`、`kimi-connector.test.ts:69`的`exposeToScript`断言删除）；grok保护集成测试fixture迁`protectedEndpoints`声明（断言意图不变）；`net-client.test.ts:56`的`exposeToScript:false`用例删除（该语义已不存在）。

### 非范围

- 不改vault存储与key派生，不改NetClient端点解析与origin校验算法。
- 不改各`connector.ts`空key判定逻辑。
- 不改`SettingsForm.tsx`的端点输入隐藏逻辑与`src/main/index.ts:427` OAuth分发、`provider-usage.ts:240`展示排序的provider分支（均非覆盖决策，不新增第三处字面量）。
- 不动t541的执行模型改动（以前置为基础；t541已删`poll`段，本task不再依赖`poll.request.auth`）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：含`exposeToScript`键的parameter经`manifest_schema`校验失败。
- [ ] AC-002：secret参数均能从vault按instance key注入`ctx.params`；非secret按配置值注入。
- [ ] AC-003：required secret缺值时抛`MissingRequiredSecretError`，信息含连接器名与中文label。
- [ ] AC-004：21个内置manifest均无`exposeToScript`键且全部通过新schema校验；`pnpm typecheck`通过。
- [ ] AC-005：实例覆盖`grok_billing`为攻击者主机时实际请求仍走官方base（攻击者0次），且Authorization仍为Bearer官方token（既有542-586测试意图保持，fixture迁`protectedEndpoints`声明）。
- [ ] AC-006：端点覆盖决策处无provider字面量特例：`refresh-service`内无`provider ===`分支决定覆盖丢弃；`rg grok_billing`在`src/main`仅命中manifest类型声明、受保护端点通用处理与测试，OAuth分发与展示排序的provider分支不受影响。
- [ ] AC-007：非受保护端点（如default）的实例覆盖仍透传生效。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p273（2026-09-30只读核实；证据`.scratch/tier1_declarative_landing/evidence.md`；正文“34处全仓统计”措辞失真，实为`connectors/`内34、全仓143）+用户2026-09-30修正（保护链三处）+审阅2026-09-30（AC-006误伤、protectedEndpoints定名与信任边界、爆炸半径清单、文档真相源）+本次复核（合法provider分支两处、isolated透传:321、fixture清单全仓`rg`、conventions:113-114/133/148、custom-connector:31/39/47/53/67/70-71/83/139）

### 有意不测

- 旧`exposeToScript`前向兼容：不测原因：用户明确不做旧兼容，旧键直接拒收。
- 全量21脚本端到端刷新：不测原因：参数注入由build_params单测与grok保护集成测试覆盖，脚本逻辑零改动。

### 测试策略

- zod负向单测：`exposeToScript`拒收。
- build_params单测：vault注入全量、required缺值抛错、非secret透传。
- 全仓fixture去键后`pnpm typecheck`通过 + 21 manifest批量校验（无旧键且parse通过）。
- grok保护集成测试：沿用既有攻击者/官方双服夹具，断言官方1次攻击者0次Bearer不变，fixture迁受保护声明。
- 非保护端点透传正向单测。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：曾靠`exposeToScript:false`隔离的自定义secret将进入脚本沙箱；边界依托t515隔离子进程与vault中介，须在decisions如实记录。`protectedEndpoints`对自定义连接器不构成安全边界（自声明可绕过），仅内置清单受信。
- 回退：`git revert`本task执行commit，恢复flag字段与grok特例。

### 依赖与约束

- 前置依赖t541（同改`manifest.ts`/`refresh-service.ts`/部分manifest，须串行；t541的`host_auth`与本task的`protectedEndpoints`正交）；安全约束：secret仅经vault中介注入，不记明文日志（既有`***`脱敏保持）；受保护端点覆盖必须丢弃并记日志，不得透传。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：宿主参数注入改为全量注入（含t095自定义连接器隔离语义变化），端点节改为受保护端点声明（含信任边界）。
- `docs/blueprint/decisions.md`：新增两条：exposeToScript删除（内置无区分度、门闩改为隔离进程）；grok特例声明化（含自定义自声明非边界）。
- `docs/blueprint/conventions.md`：新连接器节`exposeToScript`条目（:114）删除；Grok端点安全句（:148）措辞改为受保护端点声明。
- `docs/guides/custom-connector.md`：参数示例去`exposeToScript`键（:39/:47）、参数字段表该行（:83）、`ctx.params`行（:139）同步。

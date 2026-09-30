# Task spec

## 背景

脚本唯一模型下（t541），`exposeToScript`逐参allowlist失去意义：现行`build_params`（`refresh-service.ts:206`）仅当`exposeToScript:true`才把secret注入脚本沙箱，而21家34处`true`恰为脚本运行所需全部secret，属配置负担而非安全边界（真正边界是脚本隔离子进程t515与vault中介）。另`refresh-service.ts:265-266`对`provider==="grok"`硬编码删除`endpoint_overrides["grok_billing"]`，端点权威应归manifest声明，覆盖应原文透传。用户决策：最干净架构，不做旧兼容。

## 契约区

### 范围

- `manifest.ts`删除`parameter_schema`的`exposeToScript`字段，strict拒收旧键。
- `build_params`删除`exposeToScript`过滤：secret一律经vault/instance key解析，非secret走配置值；`required`缺值仍抛`MissingRequiredSecretError`（含中文label）。
- 21个`connectors/*/manifest.json`删除全部`exposeToScript`键，参数名/类型/required/label原值保留。
- 删除`provider==="grok"`特例两行，`endpoint_overrides`原文透传给`ctx`与隔离子进程；`resolve_endpoint_base`语义不变。
- 更新受影响单测（build_params过滤、grok特例、manifest fixture）。

### 非范围

- 不改vault存储与key派生，不改NetClient端点解析算法。
- 不改各`connector.ts`空key判定逻辑（保持现状）。
- 不动t541的执行模型与capabilities删除（以前置为基础）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：含`exposeToScript`键的parameter经`manifest_schema`校验失败。
- [ ] AC-002：secret参数无论旧flag有无，均能从vault按instance key注入`ctx.params`；非secret按配置值注入。
- [ ] AC-003：required secret缺值时抛`MissingRequiredSecretError`，信息含连接器名与中文label。
- [ ] AC-004：21个内置manifest均无`exposeToScript`键且全部通过新schema校验。
- [ ] AC-005：仓库内无`provider === "grok"`删除`grok_billing`特例代码，`rg`零命中。
- [ ] AC-006：grok连接器`endpointOverrides`含`grok_billing`自定义值时，实际请求base取该自定义值（透传生效）；不含覆盖时取manifest声明值。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p273（2026-09-30只读核实：`rg exposeToScript` 34处、特例`refresh-service.ts:265-266`；证据`.scratch/tier1_declarative_landing/evidence.md`）+用户2026-09-30决策（最干净架构、不兼容旧路径、合并为2 task）

### 有意不测

- 旧manifest前向兼容：不测原因：用户明确不做旧兼容，旧键直接拒收。
- 全量21脚本端到端刷新：不测原因：参数注入由build_params单测与grok透传单测覆盖，脚本逻辑零改动。

### 测试策略

- zod负向单测：`exposeToScript`拒收。
- build_params单测：vault注入全量、required缺值抛错、非secret透传。
- 21 manifest批量校验：无旧键且parse通过。
- grok端点透传单测：自定义覆盖命中、默认取manifest。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：曾靠`exposeToScript:false`隔离的secret将进入脚本沙箱；沙箱逃逸面依赖t515隔离子进程。
- 回退：`git revert`本task执行commit，恢复flag字段与grok特例。

### 依赖与约束

- 前置依赖t541（同改`manifest.ts`/`refresh-service.ts`/21 manifests，须串行）；安全约束：secret仅经vault中介注入，不记明文日志（既有`***`脱敏保持）。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：宿主参数注入与端点覆盖章节更新为全量注入与原文透传。
- `docs/blueprint/decisions.md`：新增宿主边界收敛决策条目。

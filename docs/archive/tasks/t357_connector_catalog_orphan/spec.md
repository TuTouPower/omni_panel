# Task spec

## 背景

`use_connector_catalog` 的 `create_instance_and_save` 先 `createInstance(manifest_id)`（该调用已把新实例写入 config），随后 `savePluginSettings`/OAuth logout 任一步抛错，新建实例带着默认参数残留在 config，对话框显示失败但用户下次打开会看到一个空账号，无补偿删除。

## 契约区

### 范围

- createInstance 后后续步骤失败时，调用删除/回滚接口清理刚创建的 instanceId。

### 非范围

- 不改 createInstance 本身语义。

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

- [ ] AC-001：createInstance 后任一步失败时，刚创建的实例被清理，不残留空账号。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：hook 单测（mock 后续步骤失败，断言删除接口被调）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`use_connector_catalog.ts:57`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- mock `savePluginSettings` 抛错，断言 `removeInstance`/删除接口被调用清理 instanceId。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：清理接口不存在需先补。
- 回退：若无删除接口，回退为「失败时记录 instanceId 供用户手动清理」并暴露错误。

### 依赖与约束

- 依赖：需存在可用的删除/回滚实例接口（若无则本 task 补）。

### Finalization 时更新的 blueprint

- 无

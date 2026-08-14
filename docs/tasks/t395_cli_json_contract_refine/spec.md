# Task spec

## 背景

CLI JSON 契约 3 条 minor 遗留合并（t344 review 遗留）：p160 的 `CliInstanceInfo` 契约在 `scripts/cli_json_parse.d.mts`、`cli_json_parse.mjs` JSDoc、`omni_panel.mjs:88` 三处手写重复，字段增减时漂移风险；p161 的 omni_panel.mjs 对恒为 string 的 `resolve`/`join` 结果做防御性 `typeof` 收窄（兜底值 `""` 语义错误、不可达死代码，为消 TS 的 any 推断而加）；p162 的 parse_cli_json 类型错误用例只覆盖 port 字段字符串类型，url/pid/根数组等边界未覆盖。均为契约单一来源 + 类型噪音清理 + 边界测试补全。

## 契约区

### 范围

- `scripts/cli_json_parse.d.mts` / `cli_json_parse.mjs` / `omni_panel.mjs`：
    - `CliInstanceInfo` 契约单一来源（.d.mts 唯一权威，mjs JSDoc 引用或删，omni_panel.mjs 从模块导入类型）
    - omni_panel.mjs 移除恒 string 的防御性 `typeof` 收窄（根治 .mjs 类型推断，非留兜底 `""`）
- `cli_json_parse.test.ts`：补 url/pid 类型错误（number/string 反置）、userData/startedAt 缺省空串、根节点为数组等边界用例

### 非范围

- CLI JSON 解析行为变更（契约形态与解析逻辑不变，仅类型来源与测试）
- 其它脚本类型重构

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

- [ ] AC-001：契约单一来源——`CliInstanceInfo` 定义只存在于 `.d.mts` 一处，`omni_panel.mjs` 从该处导入类型，mjs JSDoc 不再手写重复字段清单；字段增减只需改一处。
- [ ] AC-002：防御性 typeof 移除——omni_panel.mjs 不再对恒 string 的 resolve/join 结果做 `typeof` 收窄与 `""` 兜底；类型推断正确性由 typecheck/格式检查保持。
- [ ] AC-003：类型错误分支覆盖——parse_cli_json 测试覆盖 url/pid 类型错误（number/string 反置）、userData/startedAt 缺省空串、根节点为数组等边界（对比现在仅 port 字符串类型）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001/AC-002 由脚本 typecheck/格式检查覆盖；AC-003 由 cli_json_parse.test.ts 单测覆盖。

## 上下文区

- 来源：p160 / p161 / p162（`docs/pending/todo/`；2026-08-13 登记，t344 review 遗留）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- `cli_json_parse.test.ts` 扩展类型错误用例（AC-003）；脚本类型单一来源与 typeof 移除由 `pnpm typecheck` + 格式检查覆盖。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：类型来源迁移后 .mjs 的 TS 推断（esbuild/tsx 解析）若不支持导入 .d.mts 类型，需换方案（如统一声明文件）——p161 已提示根治方式待确认。
- 回退：git 回退；解析行为不变，类型迁移失败由 typecheck 捕获。

### 依赖与约束

- 无前置依赖。实现约束：契约形态（字段/语义）不变，仅类型来源单一化；CLI 输出格式不受影响。

### Finalization 时更新的 blueprint

- 无

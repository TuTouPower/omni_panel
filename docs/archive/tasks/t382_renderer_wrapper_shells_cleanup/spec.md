# Task spec

## 背景

底层组件已统一到 `components/ui/`（t269/t271），但仍保留三处旧 API 薄包装壳，调用方未迁到 `ui/` 直用：`components/SecretInput.tsx`（delegate `ui/SecretInput`，onChange(value)→onChange(event)）、`components/settings/Select.tsx`（delegate `ui/Select`，options:string[]→option）、`components/settings/Toggle.tsx`（delegate `ui/Switch`，on/onClick→checked/onChange）。双 API 并存造成选择困惑，属迁移残留。

## 契约区

### 范围

- 将调用方迁移到 `ui/` 直用：`SecretInput` 的 5 处调用方（CpaConnectorSettings/SettingsForm/CpaMgmtForm/ExaServiceKeyForm/ApiKeyForm，原 spec 列 CpaAddDialog 已不存在）改 import `ui/SecretInput` 并适配 `onChange(event)`；`settings/Select` 的 2 处调用方（general_section/data_section）改 import `ui/Select` 并内联 `options` 渲染；`settings/Toggle` 调用方改 import `ui/Switch`。
- 删除三个旧壳文件：`components/SecretInput.tsx`、`components/settings/Select.tsx`、`components/settings/Toggle.tsx`。
- 删除/迁移对应旧 API 单测（如有）。

### 非范围

- 不新增抽象；`options: string[]` 便捷性在调用点内联即可。
- 不改 `ui/` 组件本体语义。

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

- [ ] AC-001：`components/SecretInput.tsx`、`components/settings/Select.tsx`、`components/settings/Toggle.tsx` 三个文件被删除，全仓无对它们的 import（`grep` 零匹配）。
- [ ] AC-002：原 6 处 SecretInput 调用方迁移后，密钥输入行为不变（脱敏显隐、value 传递），相关表单测试仍通过。
- [ ] AC-003：原 2 处 settings/Select 调用方迁移后，下拉选项渲染与值回传行为不变，相关设置页测试仍通过。
- [ ] AC-004：`pnpm typecheck` / `pnpm lint` / `pnpm test` 通过，无残留引用与旧壳测试。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：删除后 typecheck/lint/test 全绿即证明无残留引用；行为不变由既有表单/设置页测试覆盖。

## 上下文区

- 来源：p150（`docs/pending/todo/p150_popup_titlebar_panel_button_order.md`，追加：薄包装兼容层残留）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 纯删除 + 调用方迁移，不新增行为，不写新用例；以既有测试回归为准。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 迁移前 grep 确认旧壳 import 清单；迁移后跑 `pnpm typecheck`/`lint`/`test` 全绿。旧壳单测（若存在）改为断言 `ui/` 本体或删除。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：漏迁某调用方导致 typecheck/lint 报错；`onChange` 参数形态（value vs event）适配错误导致行为回归。
- 回退：git 回退；调用方逐个迁移，每个迁移后跑对应测试。

### 依赖与约束

- 无前置依赖；与 t380/t381 文件不重叠，可并行。

### Finalization 时更新的 blueprint

- 无

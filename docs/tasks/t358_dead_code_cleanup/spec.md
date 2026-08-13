# Task spec

## 背景

一批生产死代码/死 UI：(1) `components/Button.tsx` 仅被单测引用，生产全走 `ui/Button`；(2) 顶层 `components/Card.tsx` 零引用，与 `ui/Card` 重复；(3) `CpaAddDialog` 不可达（`setShowCpaAdd` 从未置 true）且按钮无 onClick，CPA 添加已由 AddAccountDialog + CpaMgmtForm 覆盖；(4) `TokenPanel` 的 range state 死状态；(5) `TokenStatsView` 恒空 `never[]` 旧参数；(6) `SessionLibrary` 的 `content_hits` 只写不读；(7) `VendorPicker` 的 plugin_infos prop 死 prop + can_add 恒真；(8) `session_meta.ts` 无 import 死模块；(9) `usage_window_elapsed` 恒等死函数等。

## 契约区

### 范围

- 删除上述确认无消费方的死组件/死状态/死 prop/死模块，同步删除只测死组件的单测或迁移到真实组件。
- 移除 `CpaAddDialog` 及其 SettingsView 引用（保留 CPA 添加走 AddAccountDialog 单一入口）。
- 删除 TokenPanel range 分段控件（或接入真实取数，见 t363 相邻，此处按删除处理）。

### 非范围

- 不改仍在用的组件语义。

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

- [ ] AC-001：确认无生产引用的死组件/模块被删除，`tsc`/lint 通过（无残留 import 报错）。
- [ ] AC-002：`CpaAddDialog` 及其 SettingsView 入口移除，CPA 添加仍走 AddAccountDialog。
- [ ] AC-003：删除死状态/死 prop 后，相关组件测试仍通过或同步删除迁移。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：删除后 `pnpm typecheck`/`lint`/`test` 通过即证明无残留引用。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`Button.tsx:9`、`Card.tsx:6`、`CpaAddDialog.tsx:59`/`:66`、`SettingsView.tsx:123`、`TokenPanel.tsx:20`、`TokenStatsView.tsx:593`、`SessionLibrary.tsx:207`、`VendorPicker.tsx:6-14`、`session_meta.ts:1-14`、`usage-colors.ts:45-47`、`CpaConnectorSettings.tsx:85`、`usageboard-web.ts:256`/`:267`、`DeviceLoginSection.tsx:194`、`utils.ts:27`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 纯删除死代码不新增测试；以 typecheck/lint/knip 全绿为准。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 删除前 grep 确认零引用；删除后跑 `pnpm typecheck`/`lint`/`test`/`deadcode`（knip）全绿。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：误删仍被动态引用的模块。
- 回退：删除前全仓 grep 确认；误删可由 git 恢复。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

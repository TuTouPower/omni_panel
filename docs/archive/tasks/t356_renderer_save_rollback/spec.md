# Task spec

## 背景

renderer 多处配置/账号保存采用 fire-and-forget `void save_config(...)` + use-config 乐观更新，失败完全静默、无回滚：AddAccountDialog/LabelMapDialog/CpaLabelMapDialog 保存失败无 catch、错误 UI 死代码；`use_config().save` 先乐观 setConfig 再写盘，失败仅 log 不回滚；`config-debounce.flush` 失败即丢 patch 且 flush 返回 Promise 永不 reject；SettingsForm 多步保存部分失败笼统报「保存失败」。

## 契约区

### 范围

- 统一包装一个返回已消化 rejection 的保存函数（失败回滚乐观更新 + 暴露错误），供所有 `void save_config` 调用点使用。
- AddAccountDialog/LabelMapDialog/CpaLabelMapDialog 补 try/catch 并显示错误。
- `use_config().save` 失败回滚 config_ref/state 到上一已确认值并暴露错误。
- `config-debounce` 失败把 patch 合并回 pending 并安排有限重试；flush 让失败可观测（catch 后 rethrow 或明确注释）。
- SettingsForm 多步保存区分已提交阶段，文案注明「账号已保存，但 xxx 保存失败」。

### 非范围

- 不改 config 的并发冲突检测（saveIfBaseMatches，另见 t293 已修）。

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

- [ ] AC-001：保存失败时 UI 显示可见错误提示，不再静默（AddAccountDialog/LabelMapDialog 等）。
- [ ] AC-002：乐观更新在写盘失败后回滚到上一已确认状态，内存态与磁盘一致。
- [ ] AC-003：config-debounce flush 失败不丢 patch（合并回 pending 重试），失败可被调用方观测。
- [ ] AC-004：多步保存失败文案区分已提交阶段，不笼统报「保存失败」。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：renderer 组件/hook 单测（mock save 失败断言错误文案与状态回滚）。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`AddAccountDialog.tsx:182`/`:187`、`LabelMapDialog.tsx:168`/`:99`、`CpaLabelMapDialog.tsx:68`、`SettingsView.tsx:183`、`SettingsForm.tsx:179`、`use-config.ts:82`、`config-debounce.ts:53`/`:44`/`:60`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- hook/组件单测：mock `window.usageboard.config.save` 失败，断言 setConfig 回滚 + 错误文案出现。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：统一保存包装改动面大，多处调用点签名变化。
- 回退：先抽 `save_config` helper 供 `void` 调用点，逐点替换；回滚逻辑在 use-config 单点实现。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

# Task spec

## 背景

`tests/unit/renderer/views/popup_view_height.test.tsx` t196 f003 用例（keeps the refresh-all spinner while a connector snapshot is loading）存在 2 条「update not wrapped in act」警告（单文件运行即复现，2026-08-10 主仓验证）。测试通过但疑似掩盖时序问题（假绿）：裸 `setTimeout` 等待期 PopupView 内部状态更新在 act 外触发。

## 契约区

### 范围

- 修 `tests/unit/renderer/views/popup_view_height.test.tsx` t196 f003（及同文件同模式用例）：等待期状态更新包 `act` / 改 `vi.waitFor` / fake timers 推进，消除 act 警告且保留断言语义。

### 非范围

- 不改 PopupView 生产组件逻辑（警告来自测试等待方式，非组件缺陷——如需改动组件，先在本 task 内说明并调整范围）。
- 不删除或弱化 t196 f003 的断言（spinner 保持/清除的 500ms 下限语义必须真实验证）。

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

- [ ] AC-001：运行 `npx vitest run tests/unit/renderer/views/popup_view_height.test.tsx` 无 act 警告（stderr 无 "not wrapped in act"）。
- [ ] AC-002：t196 f003 断言语义保持：loading 推送期间 spinner 持续存在（超过 500ms 下限）、ready 推送后 spinner 清除；断言由真实 pending 驱动而非固定时长糊弄。
- [ ] AC-003：全量 `pnpm test` 通过（含 renderer 项目该文件全部用例）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试：AC-001 以 vitest 运行输出断言；AC-002 为用例既有断言；AC-003 为全量回归。

## 上下文区

- 来源：p089（2026-08-10 主仓确认单文件即复现 2 条 act 警告，位置 `t196 f003` 用例；之前仅批量运行复现）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 优先把用例内裸 `setTimeout` 等待改为 `act` 包裹或 `vi.waitFor` + fake timers；断言目标不变（spinner 的 `svg.animate-spin` 存在性 + 时序语义）。
- 若发现警告源自 PopupView 内部真实时序缺陷（非测试等待方式），按假绿分析结论调整修复面并更新本区。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 警告的具体状态更新源：**验证结论**（2026-08-11 复现定位）——`PopupView` spinner 自排程 `setTimeout(check, 500ms)` 周期求值 + `refreshAll()` 异步完成后的 plugins 快照更新，落在用例裸 `setTimeout(700ms)` 等待期（act 外）。属测试等待方式问题，非组件缺陷；修复为 act 包裹等待（验证方式：修复后单文件 0 警告 + 9 passed）。

### 风险与回退

- 风险：改为 fake timers 可能让 500ms 下限断言失真（若实现依赖真实 rAF/计时器链）；包裹 act 方式改动面大。
- 回退：AC-001/002 回归失败即恢复该文件改动；不改生产组件时风险仅限测试文件。

### 依赖与约束

- 约束：仅改测试文件；如须改 PopupView 生产代码，先在本 task 内说明并更新范围与 AC。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：无（若测试规范有 act 相关约定则补）。

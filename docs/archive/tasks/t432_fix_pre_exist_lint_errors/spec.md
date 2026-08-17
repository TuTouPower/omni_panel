# Task spec

## 背景

`pnpm lint`（strictTypeChecked）红 4 处：`src/renderer/lib/session-resume.ts:32/:33`（no-unnecessary-condition，t402 类型收窄后 `??`/恒 falsy 分支）、`src/renderer/views/settings-view/sections/general_section.tsx:48`（no-dynamic-delete，t402）、`tests/unit/renderer/views/settings_view_general.test.tsx:32`（consistent-type-imports，t418 import() 类型注解）。CI 已跑 lint（ci.yml → pnpm check）。

## 契约区

### 范围

- 修复上述 4 处已提交 lint error，使 `pnpm lint` 全绿；保持既有运行时语义（测试锁定：session_resume.test.ts AC-004 unknown_cli→null、AC-003/003b 清空删键）。

### 非范围

- 不修未提交 WIP 的 2 处（`src/main/index.ts:128`、`src/main/cli/background_serve.ts:111`，属用户工作区既有改动）。
- 不处理已 suppress 的 9 处同类位点（account-overrides.ts:33/65/108/112、smoke.spec.ts:23、device_code_oauth_manager.ts:291、Icon.tsx:183、SessionLibrary.tsx:282/331）。
- 不为消 lint 改动既有测试预期。

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

- [ ] AC-001：`pnpm lint`（含 strictTypeChecked 规则）全部通过（0 error）。
- [ ] AC-002：session-resume 未知命令来源 → null 与清空删键的运行时语义不变，既有测试不改预期仍全绿。
- [ ] AC-003：settings_view_general.test.tsx 的 consistent-type-imports 修复后该文件 lint 与测试均绿。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001 由 lint 命令自动判定。
- AC-002 由既有单测自动判定。
- AC-003 由既有单测自动判定。

## 上下文区

- 来源：p190（2026-08-16 核实：`pnpm lint` 当前 6 errors，其中 4 处已提交属本 task 范围，2 处为未提交 WIP 非本 task）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认；以 session_resume.test.ts 既有用例（AC-004 unknown_cli→null、AC-003/003b 清空删键）为回归锚点。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：消除 no-unnecessary-condition 时改动逻辑导致语义漂移——须以既有测试为守。
- 回退：还原修复。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

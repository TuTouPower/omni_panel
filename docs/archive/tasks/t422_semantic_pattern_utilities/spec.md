# Task spec

## 背景

DESIGN.md 合规审计（2026-08-16）发现四类复合模式复制达到「第三次复制前必须抽象」阈值：

- 告警/提示条 6 处：`SettingsView.tsx:408`、`SessionLibrary.tsx:492/498/505`、`NetBanner.tsx:11`、`LabelMapDialog.tsx:186`（error/warning 12% color-mix 浅底 + 色字配方）。
- code 值只读 chip 3 处：`LocalScanForm.tsx:42`、`SettingsForm.tsx:640`、`LabelMapDialog.tsx:233`（`rounded-md bg-surface-raised px-2 py-1.5 font-code-md`）。
- 徽章手拼 3 配方：`UpcomingResetCard.tsx:41` + `ProviderCard.tsx:156`（accent 计数徽章同字符串 2 处）、`SessionPickerModal.tsx:145`（Badge count 形态精确复制）、`BarSchemeField.tsx:50`（推荐徽章）。
- toast 2 处相同配方：`SessionLibrary.tsx:571`、`WorkspaceView.tsx:442`。

## 契约区

### 范围

- 告警条沉淀为 `@utility`（或组件）：error/warning/success 三语义浅底容器，6 处替换。
- code chip 沉淀 `@utility`，3 处替换。
- 徽章归拢到 `ui/Badge` 既有 variant（count/label），3 配方替换；推荐徽章若为新形态按形态保留原则登记为 variant。
- toast 沉淀唯一实现（组件或 @utility），2 处替换。

### 非范围

- 不改各提示的文案、触发条件与业务逻辑。
- 不新增视觉形态；只收拢现存配方的唯一实现。
- 语义色 12% 派生容器的 color-mix 用法经本 task 沉淀后成为授权先例（DESIGN.md 379 灰区的落地形态）。

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

- [ ] AC-001：告警条/code chip/徽章/toast 四类模式各有唯一实现（`@utility` 或组件），上述 14 处复制点全部替换完毕。
- [ ] AC-002：替换后各处视觉与行为不回归（组件测试 + [deploy] 目检抽查）。
- [ ] AC-003：现有测试套件不红。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/003：grep + 测试套件可自动验证。
- AC-002 观感抽查标 `[deploy]`。

## 上下文区

- 来源：DESIGN.md 合规审计（2026-08-16）；规范条款：DESIGN.md 369（三次复用沉淀 @utility）、498（Do）、476-478（徽章形态定义）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

无

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 按项目默认；替换点所在组件的既有测试保持通过。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

无

### 风险与回退

- 风险：语义色浅底容器沉淀为 @utility 后成为全局先例——命名与取值严格按 12% color-mix 既有配方，不新造比例。
- 回退：git 还原即可。

### 依赖与约束

- 与 t420/t421 同属组件层收拢，可相邻排期；与 t406-t413 会话窗口批次同触部分文件（SessionLibrary/WorkspaceView），顺序由 task-schedule 排。

### Finalization 时更新的 blueprint

- 无

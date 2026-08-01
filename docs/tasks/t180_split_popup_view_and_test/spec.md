# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

src/renderer/views/PopupView.tsx 876 行；tests/unit/renderer/views/popup_view.test.tsx 1749 行（已部分拆出 popup_view_height.test.tsx 400 行、popup_view_mirror.test.tsx 208 行）；tests/unit/renderer/views/settings_view.test.tsx 1772 行为当前最大测试文件。t044/t125/t126/t122 有拆分先例。用户要求一并拆 settings_view.test.tsx。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 拆分 PopupView.tsx（876 行）、popup_view.test.tsx（1749 行）、settings_view.test.tsx（1772 行），按领域/职责拆为更小文件，行为零变化。

### 非范围

- 不改任何组件/测试的行为；不重构逻辑，纯移动拆分。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：PopupView.tsx 拆分为多个文件，单文件行数显著下降（参考 t122 拆分后 SettingsView.tsx 724 行量级）。
- [ ] AC2：popup_view.test.tsx 与 settings_view.test.tsx 拆分为多个文件，单文件行数显著下降。
- [ ] AC3：拆分后全部既有测试通过，行为零变化；pnpm test 全绿。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 按项目默认。pnpm test 全量；拆分前后对比渲染输出。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无。

### 风险与回退

- 风险：拆分引入 import 循环或遗漏导出。
- 回退：revert 实现 commit。

### 依赖与约束

- 无。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：renderer 视图结构小节（如涉及）。

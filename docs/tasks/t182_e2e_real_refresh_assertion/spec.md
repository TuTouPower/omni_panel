# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

tests/e2e/web/scheduler.spec.ts:43 仍死等 waitForTimeout(1000)（manual refresh 测试，其后仅断言 .scroll 可见）。阻塞已解除：刷新按钮 .spinning class（PopupView.tsx:537）由 refreshing state 驱动，复位于 refreshAll().finally()（PopupView.tsx:374-388）；tests/e2e/web/popup_refresh_state_reset.spec.ts:56-72 已示范「等刷新后 collapse 按钮可见」的免死等断言模式。tray_menu_actions.spec.ts 死等已移除（无需处理）。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 替换 tests/e2e/web/scheduler.spec.ts:43 的 waitForTimeout(1000) 死等为等待真实刷新完成信号（如 .spinning class 消失或刷新后状态可见），参考 popup_refresh_state_reset.spec.ts:56-72 模式。

### 非范围

- 不改 tray_menu_actions.spec.ts（死等已移除）；不改 PopupView 刷新逻辑本身。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：scheduler.spec.ts:43 不再使用 waitForTimeout 死等，改为等待真实刷新完成信号。
- [ ] AC2：替换后 scheduler.spec.ts 相关用例通过，且能真实等待刷新完成（非固定时长）。
- [ ] AC3：既有 e2e 用例通过，无因替换引入的新失败。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 按项目默认。跑 tests/e2e/web/scheduler.spec.ts 与 popup_refresh_state_reset.spec.ts。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- scheduler.spec.ts manual refresh 用例的刷新完成信号（.spinning class 是否适用该场景）：UNVERIFIED-SPIKE，执行期读 PopupView.tsx 刷新逻辑核实。

### 风险与回退

- 风险：等待信号不稳定导致 flaky。
- 回退：revert 实现 commit。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

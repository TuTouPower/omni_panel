# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p067（用户提出）。2026-08-07 核实：用量面板概览中多账号 provider 卡片的「概览 / N账号」分段开关 `l2open` 是 `ProviderCard.tsx` 的本地 state（`ProviderCard.tsx:107`），不写 config、不恢复；popup 顶部 provider 页签 `activeTab`（`PopupView.tsx:55`）同样每次启动重置为 `"overview"`。重启后用户需重新切换。用户确认范围含顶部页签。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 每个多账号 provider 卡片的「概览 / N账号」选择持久化：切换后写入配置，软件重启（或面板重开）后恢复各 provider 上次选择。
- popup 顶部 provider 页签（overview / 各 provider）选择持久化：重启后恢复上次页签。
- 旧配置无对应键时的默认行为：保持现状默认（卡片为「概览」，页签为 overview）。

### 非范围

- 不改变切换控件本身的交互与视觉。
- 不改已有持久化键（`providerOrder`、`accountOrders`、`collapsedAccounts`、`expandedProviders`、`sparklineWindowDays`）的语义。
- 不做账号选择的跨面板同步（仅用量面板内持久化）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：将某多账号 provider 卡片切到「N账号」明细后重启应用，该卡片恢复为明细视图；切回「概览」重启后恢复为概览。多个 provider 的选择互不影响。
- [ ] AC2：切换到某 provider 页签后重启应用，面板恢复显示该页签；切回 overview 重启后恢复 overview。
- [ ] AC3：配置中无新增键（旧配置）时，首次启动行为与现状一致（卡片概览、overview 页签），不产生错误。
- [ ] AC4：面板运行期间收到外部配置回显（如导入配置）时，不把内存中的选择误写回覆盖新配置。
- [ ] AC5：现有测试与 e2e 全部通过，无回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试（AC1/AC2 的「重启」可用组件级测试模拟卸载重挂 + config mock，或 electron e2e 重启窗口验证）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 组件级：mock `window.usageboard.config`（get/save/patch），断言切换后写入正确键、挂载时从 mock 配置恢复。
- 回显防误写（AC4）：套用 t153 建立的回显抑制模式，补对应测试。
- e2e：现有 usage 面板 spec 全绿；如已有重启用例模式（t025 electron restart）可复用则加一条恢复断言。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无

### 风险与回退

- 风险：新增 config 键的回显误写覆盖（t153 类问题已有定论与模式）；`docs/specs/ui-views-web.md:43` 现行 spec 写着「账号明细仅在当前展开期间有效」，与本需求语义冲突，需随本 task 更新该 spec。
- 回退：单 commit revert；新增键残留于配置中无副作用（读取方移除后键被忽略）。

### 依赖与约束

- 无前置 task 依赖；与 t249（bundle 代码分割）无文件重叠（本 task 改 `ProviderCard.tsx` / `PopupView.tsx` 内部，t249 只改入口 import 方式）。

### Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：账号明细视图「仅当前展开期间有效」语义改为持久化恢复；顶部页签选择持久化。

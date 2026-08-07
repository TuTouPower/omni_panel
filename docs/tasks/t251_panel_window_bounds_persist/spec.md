# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

来源：p068（用户提出）。2026-08-07 核实：会话（history）与代理（agent）面板窗口由 `src/main/window/window-manager.ts` 的 `WINDOW_CONFIGS` 固定尺寸创建（agent 900x700、history 1000x720），两个 controller 只管 show/focus/closed，无任何 bounds 保存/恢复；每次打开都回到默认位置大小。设置窗口已有同类机制（`save_settings_bounds` / `apply_settings_bounds`，含 displayId、最小尺寸钳制、workArea 钳制，存 config `settingsBounds`），是直接先例。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- 代理面板窗口：移动或调整大小后保存 bounds，关闭重开及软件重启后恢复上次位置与大小。
- 会话面板窗口：同上，与代理面板各自独立保存。
- 恢复时的可见性钳制：目标位置已不在任何显示器的可见工作区（如拔掉副屏、分辨率变化）时，钳制回可见区域，语义与设置窗口现状一致。
- 旧配置无对应键时按现状默认尺寸位置创建。

### 非范围

- 不动用量面板（popup）的 `floatingBounds` 机制与设置窗口的 `settingsBounds` 机制。
- 不改变窗口的其他行为（单例、show/focus、关闭语义）。
- 不持久化最大化/全屏状态之外额外的窗口形态（若保存时处于最大化，恢复语义参照设置窗口现状；无现状则按普通 bounds 处理并在实施笔记记录）。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：调整代理面板窗口的位置与大小后关闭再打开（或重启应用），窗口恢复到上次的位置与大小。
- [ ] AC2：会话面板窗口满足同样的保存与恢复；两个窗口的 bounds 互不影响。
- [ ] AC3：保存的 bounds 落在已不可见的显示区域时，恢复结果被钳制到可见工作区内（窗口不会开到屏幕外）。
- [ ] AC4：配置中无对应键（旧配置）时，首次打开按现状默认尺寸位置显示，不产生错误。
- [ ] AC5：现有测试与 e2e 全部通过，无回归。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- AC1/AC2：electron e2e 可移动/resize 窗口后重建窗口断言 bounds（t025 已有 electron 重启用例先例）。
- AC3：钳制逻辑抽为纯函数，单测覆盖（与设置窗口钳制同一模式）。
- AC4/AC5：可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 多显示器物理插拔的真实硬件场景：无法在测试环境模拟；以钳制纯函数单测 + 设置窗口既有语义为准。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 钳制/恢复逻辑抽纯函数单测（displayId 失效、负坐标、小于最小尺寸）。
- 保存时机与防抖参照设置窗口现状；主进程侧用 mock BrowserWindow 单测覆盖 save/apply 流程。
- electron e2e：移动窗口 → 关闭 → 重开断言 bounds。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无

### 风险与回退

- 风险：保存时机（move/resize 事件频率）导致 config 写放大；最大化状态下保存的 bounds 恢复异常。两者在设置窗口先例中已有处置模式可参照。
- 回退：单 commit revert；残留 config 键无副作用。

### 依赖与约束

- 无前置 task 依赖；与 t249、t250 无文件重叠。

### Finalization 时更新的 blueprint

- 无（行为与设置窗口现有 spec 同模式，无新长期约束）。

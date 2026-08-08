# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

agent、history、setting 三类窗口的创建配置未设 minWidth/minHeight，用户可将其缩到面板最小尺寸 480x360 以下；而 bounds 保存时会把小于最小值的尺寸提升到 480x360，导致重开窗口时被额外放大，恢复尺寸与用户离开前不一致。同时 history 窗口的 bounds 保存/恢复缺少独立 e2e：既有 e2e 只覆盖 agent 窗口，history 窗口虽与 agent 共用同一创建路径、仅 bounds 键不同，其持久化链路没有端到端验证。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- agent、history、setting 三处窗口创建配置增加 minWidth/minHeight=480x360，与面板最小尺寸一致。
- 新增 history 窗口 bounds 保存/恢复 e2e，覆盖保存 → 关闭 → 重开恢复链路。

### 非范围

- 不改面板最小尺寸的数值（480x360 保持不变）。
- 不改 usage 窗口的最小尺寸设置。
- 不改 web 端窗口行为。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] AC1：agent、history、setting 窗口运行时可被拖拽缩小的下限为 480x360，无法缩到更小。
- [ ] AC2：用户缩小窗口后关闭重开，恢复的尺寸与离开前一致，不被额外放大。
- [ ] AC3：新增 history 窗口 bounds 保存 → 关闭 → 重开恢复的 e2e 用例，且通过。
- [ ] AC4：既有 agent 窗口 bounds e2e 与 window-bounds 单测保持通过；若设置最小尺寸后保存侧提升语义发生变化，按新语义调整对应测试并在实施笔记写明。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

全部 AC 可自动测试。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- usage 窗口最小尺寸：已有独立的 minWidth 设置，不经过本次改动的 bounds 保存路径，不在本 task 测试范围。
- web 端窗口行为：web 端不存在原生窗口最小尺寸概念，无需测试。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- 单测：断言 agent、history、setting 三处窗口创建配置（src/main/window/window-manager.ts）含 minWidth/minHeight=480x360。
- e2e：复用既有隔离 Electron harness，参照 tests/e2e/electron/panel_window_bounds.spec.ts 中 agent 用例模式为 history 窗口新增用例；history 窗口无需会话数据即可创建并验证 bounds 持久化。
- 既有 window-bounds 单测（tests/unit/main/window-bounds.test.ts:44-52）断言「小于最小尺寸提升到最小尺寸」为有意行为，原则上保留；仅当保存侧语义变化时按新语义调整并在实施笔记写明理由。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

无

### 风险与回退

- 风险：设置 minWidth/minHeight 后，习惯使用小尺寸窗口的用户无法再把窗口缩到 480x360 以下；影响面小、风险低。
- 回退：移除三处窗口配置中的 minWidth/minHeight 项即可恢复原行为。

### 依赖与约束

- 平台：minWidth/minHeight 为 Electron BrowserWindow 标准配置，跨 Windows / macOS / Linux 行为一致，无额外平台约束。
- 来源：p080、p081；2026-08-08 核实两处问题仍在：三处窗口配置无 minWidth/minHeight，history 窗口 bounds 持久化无独立 e2e。

### Finalization 时更新的 blueprint

- `docs/blueprint/testing.md`：如测试清单需登记新增 history 窗口 bounds e2e 用例则更新对应条目；否则无。

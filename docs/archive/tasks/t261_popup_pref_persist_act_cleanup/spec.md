# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

sparkline 窗口偏好持久化存在死锁：持久化 effect 由「已有偏好」标记门控，而该标记仅在配置中已有 `sparklineWindowDays` 键且值与当前显示值不同时才置位。该键在配置类型中是可选的，默认配置不含它，因此全新配置下用户切换 1/7/30 天选择永远不会写盘，重启后无法恢复；配置有键但值恰等于当前显示值时，首次切换同样被吞。同一组件内已有 activeUsageTab 偏好采用的 prev ref 模式（应用配置时同步 prev 值，持久化时比较 prev 与当前状态决定是否写回）可照抄解决。

另外 `popup_view_t250.test.tsx` 使用真实计时器加 600ms 等待来跨越 500ms 防抖，运行产生 8 条 React act 警告（基线为 0），需改为 fake timers 消除警告。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- sparkline 窗口偏好持久化改为 prev ref 模式，消除「配置无键时切换不写盘」死锁。
- `tests/unit/renderer/views/popup_view_t250.test.tsx` 改用 fake timers 驱动防抖等待，消除 React act 警告。

### 非范围

- 排查或统一其他组件的偏好持久化模式。
- PopupView 的拆分或结构调整。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 全新配置（配置中无 `sparklineWindowDays` 键）下用户切换 1/7/30 天，所选值持久化写盘，重开后保持所选值。
- [ ] 配置已有 `sparklineWindowDays` 键且其值等于当前显示值时，首次切换仍能正常写盘。
- [ ] 配置已有 `sparklineWindowDays` 键时重开后恢复该值（回归不破）。
- [ ] `popup_view_t250.test.tsx` 运行时 React act 警告数为 0，测试断言语义与覆盖范围不变。

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

- 新增「配置无 `sparklineWindowDays` 键时首次切换即写盘」单测；现有 `tests/unit/renderer/views/popup_view_config.test.tsx:560-598` 只覆盖有键场景，新测在同一测试文件沿用其 mock 边界与断言方式。
- `popup_view_t250.test.tsx` 改用 fake timers 并以 `advanceTimersByTime` 跨越 500ms 防抖；`@testing-library/dom@10.4.1` 的 waitFor 无 `shouldAdvanceTime` 选项（fake-timers 分支直接调全局 `jest.advanceTimersByTime`，vitest 未提供），实现以 `vi.stubGlobal("jest", vi)` 使其走 fake-timers 轮询分支；断言目标与覆盖路径保持不变。
- 运行后确认 act 警告数为 0（基线 0）。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无

### 风险与回退

- 风险：prev ref 模式照抄同一组件内现成范式，风险低；fake timers 改造可能影响其他依赖计时器的测试路径。
- 回退：还原持久化 effect 与测试文件改动即可恢复现状。

### 依赖与约束

- 修复范式参照 `src/renderer/views/PopupView.tsx` 中 activeUsageTab 的既有实现；防抖时长定义于 `src/renderer/lib/config-debounce.ts:42`。
- 来源：p078、p079（2026-08-08 核实仍在）。

### Finalization 时更新的 blueprint

- 无

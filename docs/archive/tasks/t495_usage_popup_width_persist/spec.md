# Task spec

## 背景

用户实测：用量面板被拉伸加宽后，宽度不被记住。核实（2026-09-17）：

- `src/main/core/main-panel/main-panel-controller.ts:92-93`：`save_floating_bounds()` 首行 `if (mode !== "floating" || …) return;` → **popup 模式从不保存任何 bounds**。
- popup 窗口的尺寸来自 `WINDOW_CONFIGS.usage`（`src/main/window/window-manager.ts:36-43`，`width: 482`）；`position_popup()`（`:114-128`）只沿用 `current.width`，因此**同一次运行内**隐藏/再显示能保持用户拉的宽度，**重启后回到 482**。
- `docs/specs/window-management.md` 只定义了 floating 的 `floatingBounds` 持久化（`floating-bounds.ts` + `restore_floating_bounds`），popup 宽度从未持久化——不是「忘了存」，是设计缺口。

## 契约区

### 范围

- 新增配置键保存 **usage popup 的宽度**（用户拖动改变后写入；重启后按该宽度创建/显示）。
- 恢复时按所在显示器 `workArea.width` 与主面板最小宽度（`USAGE_MIN_WIDTH`）双向 clamp；显示器变化/分辨率变化后不越界。
- popup 每次显示仍按托盘锚定重新定位（位置不持久化），高度仍由既有动态高度控制器决定。

### 非范围

- floating 模式的 `floatingBounds`（位置+尺寸）机制。
- popup 的位置持久化、动态高度算法、`maxWidth` 约束。
- 其它面板窗口的 bounds 持久化。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [x] AC-001：用户拖动改变 usage popup 宽度后，隐藏再显示保持该宽度。
- [x] AC-002：重启应用后首次显示 usage popup 使用上次保存的宽度。
- [x] AC-003：保存/恢复的宽度被 clamp 到 `[USAGE_MIN_WIDTH, 所在显示器的 workArea.width]`。
- [x] AC-004：保存的宽度超过当前显示器工作区（如换到更小分辨率/副屏）时，显示宽度被钳制到可见范围内。
- [x] AC-005：配置中无该键（旧配置）时按现状默认宽度 482 显示，不报错。
- [x] AC-006：popup 的锚定位置与动态高度行为不回归（每次显示仍贴近托盘、内容高度仍自适应）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

- AC-001 ~ AC-005：`main_panel_controller` 单测（注入假窗口/显示器，断言 resize 触发保存、创建时按保存值 setBounds、clamp 边界、缺键回退默认）。
- AC-006：既有 popup 定位/高度单测回归（`tests/unit/main/main_panel_controller.test.ts`、`tests/unit/renderer/views/popup_view_height.test.tsx`）。
- 真机拖动体验（拖动手感/闪烁）不可自动测试，归 t493 的 deploy 观察项一并看。

## 上下文区

- 来源：用户实测反馈（2026-09-17）；无 pNNN。代码证据见背景。

### 有意不测

- 多显示器热插拔的瞬时行为：单测覆盖 clamp 逻辑即可，真机归 deploy 观察。

### 测试策略

- 单测：`tests/unit/main/main_panel_controller.test.ts` 扩展（保存/恢复/clamp/缺键），必要时补 `window-bounds` 纯函数用例。
- 既有回归：popup 定位与动态高度测试保持通过。
- 黑盒：打包版手动拖动 + 重启（需用户许可）。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：与 `setMinimumSize(USAGE_MIN_WIDTH)` 的时序冲突（先设最小尺寸再 setBounds，否则默认宽度被抬升——t368 已有同类坑）；保存写放大（每次 resize 都写 config，需沿用既有 scheduleSave 节流）。
- 回退：新增键与控制器分支独立，可单独 revert；配置多一个键对旧版本无害（旧版本忽略未知键）。

### 依赖与约束

- 无前置依赖；与 t493/t494 文件不重叠，可并行执行。
- 不改变 floating 语义与既有 `floatingBounds` 键。

### Finalization 时更新的 blueprint

- `docs/specs/window-management.md`：用量面板宽度策略——popup 宽度持久化（键名、clamp 规则）与 floating 的差异。

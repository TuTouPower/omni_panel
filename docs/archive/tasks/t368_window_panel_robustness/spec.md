# Task spec

## 背景

窗口/主面板健壮性缺口：(1) `MIN_PANEL_WIDTH=472` 与 floating-bounds 的 `MIN_FLOATING_WIDTH=320`/`DEFAULT_FLOATING_WIDTH=460` 语义冲突，首次浮窗宽度被静默抬升；(2) `did-finish-load` 单次监听在 loadURL 失败时永不触发，loading 恒 true 导致 send_focus 永久缓冲；(3) settings/panel 预热窗口 loadURL 失败只 log，打开白屏无重试；(4) suppress_bounds_save 的 setImmediate 递减与用户拖拽竞态可能吞掉真实位置保存；(5) before-quit 异步清理 fire-and-forget，与 will-quit 等待集不一致；(6) tokenStatsManager.stop() 未被调用。

## 契约区

### 范围

- 统一最小宽度常量来源；补「首次默认宽度」「saved 320-472 区间」测试。
- `did-finish-load` 同时监听 `did-fail-load`（或加超时）复位 loading 并清缓冲。
- 预热窗口 loadURL 失败时 show 前重试或销毁引用下次重建。
- suppress_bounds_save 改 token 计数（每次 setBounds 用唯一 token 只清自己抑制位）。
- before-quit 清理并入 will-quit Promise.all；对称调用 tokenStatsManager.stop()。

### 非范围

- 不改窗口布局语义。

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

- [ ] AC-001：首次浮窗宽度不再被静默抬升（默认 460 保留），saved 320-472 宽度不抬升。
- [ ] AC-002：loadURL 失败后 send_focus 不永久缓冲，窗口可恢复或重建。
- [ ] AC-003：退出时 tokenStatsManager.stop() 被调用（重启后不全量重扫）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- AC-001/002/003 可自动测试（宽度单测、loadURL 失败单测、before-quit 单测）；[deploy] 项：真实 Electron 窗口 load 失败恢复需人工验证。

## 上下文区

- 来源：review_20260813_114911/review_intensive.md（`main-panel-controller.ts:21`/`:70`/`:125`、`history-window-controller.ts:81`、`index.ts:249`/`:225`/`:151`、`window-manager.ts:135`、`floating-bounds.ts:42`）

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 真实窗口 load 失败重试的端到端行为不自动化，[deploy] 人工验证。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 宽度单测补首次默认与 320-472 区间；before-quit 单测断言 stop 调用；loadURL 失败单测断言 loading 复位。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无

### 风险与回退

- 风险：统一最小宽度常量改变既有窗口行为。
- 回退：先明确语义（floating 320 / panel 472 各自用途），仅修正首次默认宽度被抬升的 bug。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无

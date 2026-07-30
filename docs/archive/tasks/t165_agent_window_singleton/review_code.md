# Task review t165（reviewer_focus: 代码）

- task：`t165_agent_window_singleton`
- spec：`docs\tasks\t165_agent_window_singleton\spec.md`
- diff_anchor：`587f4477bfb5e3d406285d018aeb9b899a19cfca`
- target：`git diff 587f4477bfb5e3d406285d018aeb9b899a19cfca`
- round：1
- reviewed_at：2026-07-30 22:59 UTC+8

## 审查范围

- 改动文件：`src/main/index.ts`（+24 / -3）
- 审查对象：`agentWin` 单例引用、`createOrFocusAgentWindow`、`TOKEN_STATS_OPEN` handler、`before-quit` 清理。
- 对照参考：`settingsWin` 单例（`ensure_settings_window` / `createOrFocusSettings`）、`windowManager.createWindowFor("agent")`（`src/main/window/window-manager.ts:99-160`）、agent 窗口配置（`WINDOW_CONFIGS.agent`，`show:false` + `showWhenReady:true`）。

## 规格合规（实现层）

| AC                                         | 实现位置                                                     | 结论 |
| ------------------------------------------ | ------------------------------------------------------------ | ---- |
| 多次触发只存一个 agent BrowserWindow       | `index.ts:540-552`（复用分支提前 return）                    | 满足 |
| 已打开时 focus 而非新建                    | `index.ts:541-545`（`show()+focus()+return`）                | 满足 |
| 关闭后引用清空，再次触发可新建             | `index.ts:547-549`（closed 清空）+ `index.ts:541` falsy 检查 | 满足 |
| 单测覆盖单例行为（mock createWindow 次数） | 实现侧不评（属 test reviewer）                               | —    |

不变量：未违反。非范围（main panel、agent 内部数据加载、windowManager 工厂）未触碰。无 spec 外自由发挥。

## 代码质量 / 正确性

### 单例生命周期一致性

- 与 `settingsWin` 模式对齐：均为「模块级 `let ref: BrowserWindow | null`」+「closed 清空」+「before-quit destroy + null」三件套，模式一致。
- `before-quit` 中 `agentWin.destroy()` 同步触发 closed 回调 → 回调内 `agentWin = null`，紧跟的 `agentWin = null` 幂等，无副作用。
- closed 监听器依赖 BrowserWindow 销毁时自动解绑，无事件监听泄漏。
- `main_panel_controller?.close_for_mode_switch()` 在 agent 清理之后执行，不共享 `agentWin` 引用，无相互干扰。

### showWhenReady 与显式 show()

`WINDOW_CONFIGS.agent` 为 `show:false` + `showWhenReady:true`，`windowManager.createWindowFor` 已注册 `ready-to-show → win.show()`（`window-manager.ts:151-155`）。`createOrFocusAgentWindow` 新建路径紧接着显式 `agentWin.show(); agentWin.focus();`（`index.ts:550-551`），与 ready-to-show 后的 show 重复。

此行为原 handler 即存在（原 `win.show(); win.focus();`），t165 保留，未引入新回归，且 spec 非范围声明「不改 agent 窗口内部数据加载」，不计 finding。仅作观察记录：未来若要规避 Windows 新窗口白屏闪烁，可参考 `ensure_settings_window` 的 pre-warm 模式。

### 边界 / 并发

- IPC handler 在主进程事件循环中单线程调度，`createOrFocusAgentWindow` 无 `await`，无 race。
- `isDestroyed()` 在 `destroy()` 调用后立即为 true；`before-quit` 外部无其他路径主动 destroy `agentWin`，destroying 中间态不会被外部观察到。
- `windowManager.createWindowFor("agent")` 在固定 key 下不会抛 `Unknown window`；无 swallowed error。

### 圈复杂度

`createOrFocusAgentWindow` CC ≈ 2（单个 if 提前 return），远低于阈值。

### 文件膨胀

`src/main/index.ts` 997 行，超过实现源码 important 阈值（800）。本 task 净增 24 行（占 2.4%）。按规则字面条件（≥800 且本 task 净增）成立，但「继续堆大则不可信」语义指向显著增量，24 行不构成「堆大」。经 Pre-Report Gate #4 可辩护性权衡，降级为 minor。

## Findings

### t165_code_f001 - `src/main/index.ts` 已达 997 行，本 task 仍净增

- 严重度：minor
- 位置：`src/main/index.ts`（整文件）
- 问题：文件物理行数 997，已超实现源码 important 阈值（800）。本 task 在此处继续净增 24 行（`agentWin` 声明、`createOrFocusAgentWindow`、before-quit 清理块、TOKEN_STATS_OPEN 改写）。虽然增量占比小，但文件长期累积已临近 1000 行，单文件承载 tray、settings、agent 三类窗口单例 + IPC 注册 + 启动流程，后续继续在此堆叠会加剧阅读与合并冲突负担。
- 建议：非本 task 必须处理。后续可在独立 task 中将窗口单例（settings / agent / trayMenu）抽到 `src/main/window/window-singletons.ts` 之类的模块，或按窗口类型拆分 IPC handler 注册。本 task 验收不阻断。

## 结论

- 前轮 finding 复核：不适用（Round 1）。
- 本轮新发现：1 条（minor，文件膨胀，不阻断）。
- 总体判断：实现严格对齐 spec 三条 AC 与不变量，与既有 `settingsWin` 单例模式一致；closed / before-quit 两处引用清空时机正确，无内存泄漏；未影响 `main_panel_controller`。唯一 finding 为文件膨胀 minor 提醒，不阻断本 task 验收。

verdict: FAIL

## Round 2 (2026-07-30 23:20 UTC+8)

### 前轮 finding 复核

- **t165_code_f001（index.ts 膨胀）已修**：抽离 `create_agent_window_controller` 到 `src/main/core/main-panel/agent-window-controller.ts`（74 行独立模块），`index.ts` 改为 `import` + 注入式构造（`index.ts:610-612`）+ handler 转发 `open_or_focus()`（`index.ts:798`）+ before-quit `shutdown()`（`index.ts:920`）。
    - 行数复核：`wc -l src/main/index.ts` = **982**（round1 基线 997，本 task 现净 **-15** 行）。净增条件（「本 task 仍净增」）不再成立，finding 消除。

### 新模块正确性

- **closed 清引用**：`agent-window-controller.ts:62-66`，`if (win === target) win = null`，身份校验避免 shutdown→recreate 时序下误清新窗口。
- **shutdown 幂等**：`agent-window-controller.ts:70-73`，`if (win && !win.isDestroyed()) win.destroy(); win = null`；二次调用 win 已 null，跳过 destroy 后再赋 null，无 throw。测试 `shutdown is idempotent when no window exists` 覆盖。
- **destroyed 不复用**：`open_or_focus` 入口 `if (win && !win.isDestroyed())` 双重判断；外部 destroy 路径（未走 closed 回调）下仍能重建。测试 `does not reuse a destroyed window` 覆盖。

### 注入式一致性

- `create_agent_window_controller(deps: { create_window })` 与 `create_main_panel_controller(deps: { create_window, ... })`（`main-panel-controller.ts:34-46`）模式对齐：工厂函数 + 闭包 `let win: ... | null` + `deps.create_window()` 注入。风格一致，无分层越界。

### 新问题扫描

- 无。原 `win.show(); win.focus()` 与 `ready-to-show` 重复 show 的观察项已在 round 1 记录为非本 task 范围，非新问题。
- `npx tsc --noEmit` 干净；`tests/unit/main/agent_window_controller.test.ts` 6 测试全过。

### 本轮新发现

- 0 条。

### 总体判断

前轮 finding 已修（净 -15 行，膨胀条件消除），新模块单例语义正确（closed/destroyed/shutdown 三路径均覆盖），注入式设计与 main-panel-controller 一致。无新问题。

verdict: PASS

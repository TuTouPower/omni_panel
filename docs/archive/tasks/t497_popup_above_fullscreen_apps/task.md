---
tid: "t497"
slug: "popup_above_fullscreen_apps"
title: "菜单栏弹窗需浮于全屏应用之上（NSPanel / 全空间可见）"
status: "done"
branch: "t497_popup_above_fullscreen_apps"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "244f96b232b0bc3ca0a476113734ad2e3789c138"
depends_on: ""
conflicts_with: ""
note: "来源：用户对比其它菜单栏应用：其弹窗在全屏应用之上；当前仅 setAlwaysOnTop，无 visibleOnFullScreen/panel 类型"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

- 窗口类型注入：在 `src/main/window/window-manager.ts` 中针对 `usage` 面板且 `target_platform === "darwin"` 注入 `type: "panel"`，获得 `NSPanel` 与 `NSWindowStyleMaskNonactivatingPanel` 特性（AC-001）。
- 空间与全屏可见性：在 `src/main/core/main-panel/main-panel-controller.ts` 创建窗口时调用 `setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })`，置顶级别使用 `floating`（AC-001/AC-003/AC-005）。
- 展示与焦点：macOS 下展示面板时调用 `showInactive()` 且不调用 `focus()`，避免打断或切出当前全屏应用（AC-002）。
- 跨平台兼容：Windows/Linux 保持既有 `show()` + `focus()` 与布尔型 `setAlwaysOnTop`，不回归既有行为（AC-006）。
- 未知契约闭环：验证了 `usage` 面板通过托盘切换或 IPC 隐藏，不依赖 window blur，因此 `type: "panel"` 不存在交互冲突；spike 标记已闭环为已验证。

## Review 处置

### Round 1 (2026-09-17 09:35 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：全量单测 3848 个用例全部通过（覆盖 `tests/unit/main/window_manager.test.ts`、`tests/unit/main/main_panel_controller.test.ts`、`tests/unit/main/core/dock-badge.test.ts`）
- 黑盒：静默单元与集成测试全绿
- review：Round 1 PASS（review_general.md）
- AC 证据：见 `handoff.json`

### 结果摘要

- 完成 macOS 用量弹窗全屏浮动与非激活显示改造，通过 NSPanel、visibleOnFullScreen 与 showInactive 实现全屏应用之上展示与多空间平滑漫游，Windows/Linux 平台行为保持完全兼容隔离。

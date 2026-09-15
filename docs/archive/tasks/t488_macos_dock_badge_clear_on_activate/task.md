---
tid: "t488"
slug: "macos_dock_badge_clear_on_activate"
title: "macOS 激活与聚焦时清理 Dock 历史通知角标"
status: "done"
branch: "t488_macos_dock_badge_clear_on_activate"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "c7c46a05ae73c7fc48ffe31505e8a187c9dd13ad"
depends_on: ""
conflicts_with: ""
note: "来源 p232：主窗口展示/聚焦及应用激活时清理 macOS Dock 角标计数"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

执行期记录关键步骤、决策、验证、阻塞和用户批准的新轮次上限。

创建期不预测实施步骤。只记有追溯价值的内容；无事项时写“无”。

1. 创建 `src/main/core/dock-badge.ts`，封装针对 macOS 系统的角标清理逻辑（`app.dock.setBadge("")` 与 `app.setBadgeCount(0)`），并提供平台与依赖注入保护，非 macOS（Windows / Linux）安全跳过。
2. 在 `src/main/window/window-manager.ts` 中针对所有创建的窗口注册 `win.on("focus")` 触发 `clear_dock_badge()`。
3. 在 `src/main/core/main-panel/main-panel-controller.ts` 中增加 `on_show` 回调并在展示窗口时触发清理。
4. 在 `src/main/index.ts` 中注册 `app.on("activate")` 事件，并在主面板展示以及设置窗口打开聚焦时清理角标。
5. 编写单元测试 `tests/unit/main/core/dock-badge.test.ts` 覆盖跨平台行为与容错，测试（5/5 PASS）、类型检查（0 错误）、Lint（0 警告）全部通过。

## Review 处置

Round 1 零 finding

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`vitest run tests/unit/main/core/dock-badge.test.ts` (5/5 PASS)
- 黑盒：多平台环境模拟测试（darwin/win32/linux）验证平台隔离与调用
- review：Round 1 general PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 完成了 macOS 下应用激活、窗口展示与聚焦时清理 Dock 历史通知角标的功能，彻底消除了未读角标常驻问题。

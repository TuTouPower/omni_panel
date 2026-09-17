---
tid: "t494"
slug: "panel_titlebar_unify"
title: "面板 titlebar 统一：Settings 分支缺 onNavigate、刷新被屏蔽、Session 冗余嵌套"
status: "done"
branch: "t494_panel_titlebar_unify"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "e676cd9d131554984b22ca228fd2149948682379"
depends_on: "t493"
conflicts_with: ""
note: "来源：用户发现各面板 titlebar 不一致"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. AC-001: 在 `SettingsView.tsx` 中的 loading 与 error 分支为 `<PanelTitleBar>` 补齐 `onNavigate={navigate}` 与 `onRefresh={() => { void reload(); }}`。
2. AC-002 & AC-003: 移除 `PanelTitleBar.tsx` 中的 `panel !== "Settings"` 刷新按钮屏蔽逻辑，所有五个面板右侧按钮统一遵循「[刷新] → [五面板切换] → [窗口控制]」，Usage 浮动形态为「[刷新] → [五面板切换] → [隐藏到托盘]」。
3. AC-004: 移除 `SessionShell.tsx` 中顶栏外层多余的 `<header>` 容器，由 `PanelTitleBar` 携带 `data-testid="session-topbar"` 直接渲染，避免边框与背景重复声明。
4. AC-005: 保持 web 构建下原生 `<a>` 链接与无窗口控制特性。
5. 修复 `application_menu.test.ts` 缺少的 Electron 类型导入及 eslint no-unsafe-return 警告。
6. 更新 `DESIGN.md` 中 `panel-titlebar` 规范，并通过 `pnpm run designmd:check`。

## Review 处置

Round 1 (2026-09-17 08:42 UTC+8) 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` 全量 3826 通过；新增 `settings_view_titlebar.test.tsx`，更新 `PanelTitleBar.test.tsx` 与 `SessionShell.test.tsx`
- 门禁：`pnpm run typecheck`、`pnpm run lint`、`pnpm run format:check`、`pnpm run designmd:check` 全部 PASS
- review：`review_general.md` verdict: PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 统一了全部 5 个面板的标题栏结构与右侧动作按钮顺序（刷新 → 面板切换 → 窗口控制）。
- Settings 面板三个分支均提供可用的面板切换与刷新入口。
- Session 面板移除了顶层多余的 `<header>` 边框背景包装。

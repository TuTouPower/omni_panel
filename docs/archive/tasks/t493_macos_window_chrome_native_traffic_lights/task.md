---
tid: "t493"
slug: "macos_window_chrome_native_traffic_lights"
title: "macOS 窗口 chrome 对齐 macOS 规范（原生交通灯 + 标题栏只留面板名 + 标准菜单）"
status: "done"
branch: "t493_macos_window_chrome_native_traffic_lights"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "07f5dae855a790728e12b8a9ce6afcd00da31ccd"
depends_on: ""
conflicts_with: ""
note: "来源：用户审核发现 macOS 上自绘右侧 min/max/close 与左上 logo+全名不符合 Mac 应用规范"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

1. Spike 验证：macOS 下 titleBarStyle: 'hidden' 原生交通灯与 trafficLightPosition 表现稳定；拖拽与双击全屏/最大化行为依托系统原生处理；交通灯占位宽度确定为 78px。
2. Application Menu：实现 `setup_application_menu`，支持 ⌘W 窗口关闭分流（Usage 面板调用 hide 保持后台常驻，其它独立窗口调 close 关闭）、⌘M 最小化、⌃⌘F 全屏、⌘H 隐藏、⌘Q 退出。
3. Window Manager：macOS 下除 usage 仍保持无边框 (frame: false) 外，setting/agent/session/dev 采用 frame: true + titleBarStyle: 'hidden'。Windows/Linux 保持现有自绘 frame: false。
4. PanelTitleBar：macOS 下保留 78px 交通灯占位，隐藏自绘窗口三连控制钮；标题简化为纯面板名（{panel}），移除 logo 与 Omni Panel 前缀；系统窗口原生标题仍保持 `Omni Panel - <panel>`。
5. 门禁验证通过：3821 passed tests (vitest), typecheck, lint, format:check 全部绿色。

## Review 处置

### Round 1 (2026-09-17 08:23 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`pnpm test` (3821 passed), `pnpm typecheck`, `pnpm lint`, `pnpm format:check`
- 黑盒：非干扰级测试与单元/集成测试全绿；live 行为待打包/部署后交付
- review：`review_general.md` PASS
- AC 证据：见 `handoff.json`

### 结果摘要

- 实现了 macOS 窗口 chrome 对齐 macOS 规范：macOS 设置/会话/开发等常规窗口接入原生交通灯与隐藏标题栏（titleBarStyle: 'hidden'），自绘标题栏隐藏自绘窗口控制按钮并预留 78px 交通灯占位区；标题统一只保留纯面板名，移除 logo 与 Omni Panel 前缀；系统级原生窗口标题保留 `Omni Panel - <panel>`；实现 macOS 应用菜单与 ⌘W / ⌘M / ⌃⌘F / ⌘H / ⌘Q 标准快捷键，Usage 面板 ⌘W 隐藏至托盘，其它常规窗口关闭。全平台测试全部通过。

---
tid: "t496"
slug: "macos_tray_and_dock_icon_spec"
title: "macOS 菜单栏模板图与 Dock 图标尺寸规范"
status: "done"
branch: "t496_macos_tray_and_dock_icon_spec"
worktree: ""
review_level: "single"
review_limit: "5"
verify_limit: "5"
diff_anchor: "c441ad5894ee7e93850c83dd3489ab3b45282536"
depends_on: ""
conflicts_with: ""
note: "来源：用户反馈菜单栏 logo 偏大、Dock logo 偏小；实测 tray-icon.png 32x32 非模板图、icon.png 主体仅占 76.2%（Apple 模板为 80.5%）"
---

# Task 过程总账

front matter 只经 `task.py` 修改；reviewer 只写对应 `review_*.md`。

## 实施笔记

- 核实 Apple HIG macOS app icon 规范：1024×1024 画布、主体 824×824（≈80.5%）、四周 padding 100px。
- 核实 macOS 菜单栏模板图机制：16×16 pt（1x=16px, 2x=32px），纯黑（#000000）+ Alpha 单色图；文件名以 `Template.png` 结尾并在 `src/main/index.ts` 调用 `trayIcon.setTemplateImage(true)`。
- 更新 `scripts/render_icon.mjs` 与 `scripts/render-test-icons.mjs`：生成 824×824 居中 `assets/icon.png`、多尺寸 `assets/icon.ico`、16×16 与 32×32 `assets/tray-iconTemplate*.png`；测试实例包含右上角单色 "T" 标识。
- 更新 `src/main/core/paths.ts`：在 darwin 平台返回 `tray-iconTemplate.png` 与 `tray-icon-testTemplate.png`，支持可选 `base_dir`。
- 更新 `src/main/index.ts`：在 darwin 平台调用 `trayIcon.setTemplateImage(true)`。
- 更新 `electron-builder.yml` 与 `electron-builder.test.yml`：`extraResources` 引入模板图资源；验证打包工具链直接根据 1024 PNG 输出全尺寸 16~1024 icns。
- 更新 `DESIGN.md`：增补 Dock 图标网格与菜单栏图标规范。
- 新增单元测试 `tests/unit/main/icon_assets.test.ts` 与 `tests/unit/paths.test.ts`。

## Review 处置

### Round 1 (2026-09-17 09:16 UTC+8)

Round 1 零 finding。

## 收尾报告

### 验收与验证

- spec：[`spec.md`](spec.md)
- 结果：全部满足
- 测试：`tests/unit/main/icon_assets.test.ts`（10 passed）、`tests/unit/paths.test.ts`（12 passed）、全量单测 312 文件 3843 tests 全绿；typecheck/lint/format/designmd 全通
- 黑盒：门禁命令全部通过；打包工具链 .icns 生成包含 16/32/64/128/256/512/1024 全部尺寸已核验
- review：Round 1 PASS（`review_general.md`）
- AC 证据：见 `handoff.json`

### 结果摘要

- 修复 macOS 菜单栏图标偏大且不适应深浅色主题的问题，改为标准 16pt 模板图（16×16 与 32×32 @2x，无彩色像素，设置 templateImage 语义，测试实例带 "T" 标识）。
- 修复 macOS Dock 图标主体偏小的问题，按 Apple HIG 网格规范调整为 824×824 居中（占 1024 画布约 80.5%）。
- 完整保留 Windows 与 Linux 的彩色图标与 ICO 资源生成。
- DESIGN.md 沉淀了应用与系统级图标规范。

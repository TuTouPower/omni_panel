# Task spec

## 背景

`electron-builder.yml:33` `win.icon: assets/icon.ico`，但 `scripts/render_icon.mjs` 只产 `assets/icon.png`，`assets/icon.ico` 是 2026-06-24 陈旧文件（`logo.svg` 6-25 更新、`icon.png` 7-20 重生成，但 `.ico` 没跟）。打包后 Win exe 图标显示陈旧（用户看到 kimi 错图）。

## 范围

- 加 `png-to-ico` 依赖
- 扩 `scripts/render_icon.mjs`：从 `assets/logo.svg` 经 resvg 渲染多尺寸 PNG（256/128/64/48/32/16），用 png-to-ico 合成 `assets/icon.ico`
- 重跑 `node scripts/render_icon.mjs` 生成新 icon.ico（+ icon.png）
- 重打包验证：`pnpm package` 后 `artifacts/win-unpacked/OmniUsage.exe` 图标更新

## 非范围

- 不改 logo.svg（源正确）
- 不改 mac/linux icon（用 .png，已新）
- 不改 electron-builder.yml icon 路径

## 验收标准

- [ ] `scripts/render_icon.mjs` 产 icon.png + icon.ico（多尺寸）
- [ ] `assets/icon.ico` mtime 更新（非 6-24 陈旧）
- [ ] 重打包后 exe 图标为新 logo（非 kimi）—— 用户视觉确认
- [ ] `pnpm test`（vitest）不受影响
- [ ] `pnpm typecheck` 过

## 依赖与约束

- `png-to-ico` 为 devDependency
- exe 图标视觉确认需用户看（Windows 图标缓存可能需刷新）

# Task plan

## 步骤与验证

1. 加 `png-to-ico` devDependency（`pnpm add -D png-to-ico`）→ 验证：package.json 含
2. 扩 `scripts/render_icon.mjs`：多尺寸 PNG + png-to-ico 合成 .ico → 验证：node 跑产 icon.ico
3. 跑 `node scripts/render_icon.mjs` → 验证：`assets/icon.ico` mtime 更新 + 文件大小合理（多尺寸 ~100KB+）
4. `pnpm typecheck` + `pnpm test` → 验证：不破
5. `pnpm package` 重打包 → 验证：exe 图标更新（用户视觉确认）
6. review×2 + adoption + task_report + 归档 + commit

## 风险与回退

- 风险：Windows 图标缓存显示旧图 → 提示用户清缓存或看 artifacts/win-unpacked/OmniUsage.exe 直接图
- 风险：png-to-ico 版本/平台兼容 → 失败回退手写 ICO 编码（ICO 头 + PNG 嵌入）
- 回退：revert render_icon 改动，icon.ico 回陈旧

## Finalization 时更新的 blueprint

- 无（图标资源修复，非架构）

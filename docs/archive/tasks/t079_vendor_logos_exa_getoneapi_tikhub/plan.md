# Task plan

## 步骤与验证

1. 红：先在 `icon.test.tsx` 加用例（exa 双主题对齐 opencode_go 模式；getoneapi/tikhub 单图对齐 deepseek 模式）→ 验证：`pnpm vitest run tests/unit/renderer/components/icon.test.tsx` 失败（当前三者均回落 overview SVG）。
2. exa 资产：访问 <https://exa.ai/brand> 下载黑 / 白两版 logo（优先 SVG，位图取最高分辨率），存为 `src/renderer/assets/vendor_logos/exa_light.*` / `exa_dark.*`；删除根目录 `exa.ico` → 验证：文件就位、格式可 import。
3. getoneapi/tikhub 资产：根目录两图移入 `src/renderer/assets/vendor_logos/` → 验证：文件就位。
4. `Icon.tsx` 接线：exa 注册进 `VENDOR_THEME_LOGOS`（黑版=light、白版=dark），getoneapi/tikhub 注册进 `VENDOR_LOGOS` → 验证：新用例转绿。
5. 视觉抽查 28px 下三者渲染（含 dark 主题下 exa 白版与 tikhub jpeg 白底问题）→ 验证：dev 启动肉眼确认，异常决策记 task.md。
6. 全量回归：`pnpm test` / `pnpm typecheck` / `pnpm lint` → 验证：全绿。

## 风险与回退

- 风险：品牌页结构变动 / 资产直链失效 / 仅提供 press kit 压缩包；exa 品牌页无法访问（网络受限）；`tikhub.jpeg` 无透明通道在深色主题下可能出现白底方块。
- 回退：改动仅资产 + `Icon.tsx` 数行 + 测试，整体 `git checkout` 还原；exa 下载失败按 spec 约束走 blocked 请用户处置，不静默退回 `exa.ico`；jpeg 白底问题转 PNG 去底或换源解决。

## Finalization 时更新的 blueprint

- 无（纯资产接线，无架构/约定变化）。

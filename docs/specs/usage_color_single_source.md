# 用量九色与 accent 预设颜色单一来源

## 摘要

nine-cycle 九色、accent 五档预设、about 页入口 tint 的 hex/色值不得在消费侧复制；运行时只引 token 或 `lib/theme.ts` 映射表。

## 行为契约

- **九色**：hex 定义只在 DESIGN.md → `globals.css` 的 `--color-usage-1..9`。`usage-colors.ts` 注入 `var(--color-usage-N)`；设置页 nine-cycle swatch 复用同一 `USAGE_COLOR_TOKENS`，禁止本地 hex 数组。
- **accent 预设**：五档 hex→key 映射只在 `src/renderer/lib/theme.ts`（`ACCENT_PRESET_LIST` / `ACCENT_PRESETS` / `ACCENT_PRESET_COLORS` / `DEFAULT_ACCENT_COLOR`）。`appearance_section.tsx` 只引用导出，不持 hex 副本。
- **about tint**：入口图标 tint 用 `var(--color-accent-*)` / `var(--color-on-primary)`，禁止裸 hex。
- **非范围**：ECharts palette resolver 的 canvas 解析 fallback 不在本契约（已独立合规路径）。

## 验证

- 单测：`tests/unit/renderer/lib/usage-colors.test.ts`、`t418_color_single_source.test.ts`、`provider_card_colors.test.tsx`
- 源码 grep：目标文件无 `#[0-9a-fA-F]{6}` 九色/tint 副本
- 门禁：`pnpm test`

## 来源

- t418（2026-08-16）

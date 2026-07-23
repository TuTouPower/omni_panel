# Task spec

## 背景

`exa` / `getoneapi` / `tikhub` 三个连接器（t049/t050/t051 落地）在 `src/renderer/components/Icon.tsx` 的 `VENDOR_LOGOS` / `VENDOR_THEME_LOGOS` / `VENDOR_MARKS` 中均无条目，`VendorMark` 渲染时落到 `VENDOR_MARKS["overview"]` 四宫格默认占位。

logo 来源分两路：

- `exa`：**执行本 task 时**由 agent 自行从官方品牌页 <https://exa.ai/brand> 下载；页面提供黑 / 白两种模式 logo，正好对应 light / dark 双主题，按 `VENDOR_THEME_LOGOS` 接线（同 grok / opencode_go）。根目录 `exa.ico` 弃用。
- `getoneapi` / `tikhub`：用户已在仓库根目录供图（`getoneapi.png` 686×698、`tikhub.jpeg` 800×800），按 `VENDOR_LOGOS` 单图接线（同 deepseek / firecrawl）。

## 范围

- `exa`：执行时从 <https://exa.ai/brand> 下载黑 / 白两版 logo（优先 SVG；仅有位图则取最高分辨率），命名 `exa_light.*` / `exa_dark.*` 放入 `src/renderer/assets/vendor_logos/`；黑版用于 light 主题、白版用于 dark 主题，注册进 `VENDOR_THEME_LOGOS`。根目录 `exa.ico` 删除，不入库。
- `getoneapi` / `tikhub`：根目录图片移入 `src/renderer/assets/vendor_logos/`（沿用 vendor id 命名），根目录不再保留副本；`Icon.tsx` 加 import 并注册进 `VENDOR_LOGOS`。
- `tests/unit/renderer/components/icon.test.tsx` 新增用例：`exa` 走双主题断言（对齐 opencode_go 既有用例：light/dark 两 img、无固定宽高、src 分别含 `exa_light` / `exa_dark`）；`getoneapi` / `tikhub` 走单图断言（对齐 deepseek 既有用例：渲染 `img.vendor-logo-img` 且 src 含 vendor 名）。

## 非范围

- `getoneapi` / `tikhub` 不做 light/dark 双主题变体（单图走 `VENDOR_LOGOS`）。
- 不改其他 vendor 的 logo 与 fallback 逻辑；不动 `overview` 默认占位本身。
- 不处理 `vendor_logos/` 下既存未接线资产（claude.png / glm.png / deepseek.png / minimax.png / mimo.svg / cpa.svg）。

## 验收标准

- [ ] `src/renderer/assets/vendor_logos/` 下存在 `exa_light.*` / `exa_dark.*`（来自 exa.ai/brand）与 `getoneapi.png` / `tikhub.jpeg`；根目录 `exa.ico` / `getoneapi.png` / `tikhub.jpeg` 均已移除。
- [ ] `<VendorMark id="exa" />` 渲染 light/dark 两张 `img.vendor-logo-img`（`vendor-logo-light` / `vendor-logo-dark`），`getoneapi` / `tikhub` 渲染单张 `img.vendor-logo-img`，三者均不再回落 overview 四宫格。
- [ ] `icon.test.tsx` 新用例通过；`pnpm test` 全绿。
- [ ] `pnpm typecheck` 与 `pnpm lint` 通过（静态 import 类型经 `vite/client` 声明）。

## 依赖与约束

- 无前置 task。**仅 exa 下载步骤需要网络**（访问 exa.ai/brand）；规划/backlog 阶段不下载，执行时才下载。
- 品牌页结构变动或下载失败时不静默退回 `exa.ico`，按 blocked 请用户处置。
- vite 默认支持 `.svg` / `.png` / `.jpeg` 静态资产 import，无需改构建配置。

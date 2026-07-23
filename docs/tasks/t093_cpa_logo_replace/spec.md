# Task spec

## 背景

CPA 当前 logo 为 `VENDOR_MARKS["cpa"]` 内联 SVG（四段圆环占位图）。用户要求替换为 CLIProxyAPI 开源项目的官方 logo。

logo 已下载：`src/renderer/assets/vendor_logos/cpa.png`（460×460 PNG，来自 github.com/router-for-me org avatar）。

## 范围

- `Icon.tsx`：import `cpa_png` + 注册到 `VENDOR_LOGOS`（单图，非双主题）。
- 删除 `VENDOR_MARKS["cpa"]` 内联 SVG fallback。
- `connectorProviderSchema` 已含 `"cpa"`，无需改。

## 非范围

- 不改其他 vendor logo。
- 不改 CPA 连接器逻辑。

## 验收标准

- [ ] `<VendorMark id="cpa" />` 渲染 `img.vendor-logo-img`（CLIProxyAPI logo）。
- [ ] 不再回落 VENDOR_MARKS 四段圆环。
- [ ] `pnpm test` / `pnpm typecheck` 全绿。

## 依赖与约束

- logo 文件已在仓库（cpa.png）。

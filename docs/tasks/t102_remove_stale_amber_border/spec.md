# Task spec

## 背景

用量卡片（ProviderCard）报错或数据过期时，整个卡片外圈会渲染黄色边框（`.card.stale { border-color: color-mix(amber 34%) }`，`src/renderer/styles/globals.css:615`）。用户明确要求：不要黄色边框，只有报错信息文字即可。

触发条件：`ProviderCard.tsx:117` `(group?.stale || has_stale_error ? " stale" : "")`。

## 范围

- 删除 `.card.stale` CSS 规则（黄色 border-color）。
- 保留 `.stale-badge`（「已过期」文字徽章）和 `.card-state.err`（错误信息红色文字）。
- 同步检查 `ProviderAccountRow.tsx:126` 的 account 级 `.stale` class 是否也用了相同样式，若是则一并清理。

## 非范围

- 不改 stale 判定逻辑（`group.stale` / `has_stale_error`）。
- 不改 `.card-state.auth` 内 chevron 图标的 amber 颜色（`globals.css:828-830`）——仅删除卡片外框 amber border。
- 不改错误信息文本与位置。

## 验收标准

- [ ] 卡片报错或 stale 时，卡片外圈不再有黄色边框；只显示错误信息或「已过期」徽章。
- [ ] 正常卡片样式不受影响。
- [ ] `pnpm test` 全量通过；如有断言 `.card.stale` 的测试同步更新。

## 依赖与约束

- 无。

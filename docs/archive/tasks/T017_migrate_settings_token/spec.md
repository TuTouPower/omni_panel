# Task spec

## 背景

T011 settings_view 回退 specs/（6 case，2 失败：accounts DOM `.acct-row`/用量标签映射 web SPA 无），4 case web 可跑但整文件回退。popup_token_panel 无 Electron API（仅需 VITE_ENABLE_TOKEN_PANEL=1），未迁。electron/popup_theme 与 web/popup_theme（T010 示范）重复。收尾这三处。

## 范围

- **settings_view case 级拆迁**：4 case web 可跑（sidebar/nav/颜色/样式）拆到 `tests/e2e/web/settings_view.spec.ts`；2 case electron 专属（accounts DOM / 用量标签映射）留 `tests/e2e/electron/settings_view.spec.ts`。
- **popup_token_panel 评估**：若仅需 `VITE_ENABLE_TOKEN_PANEL=1` env（web 可设）则迁 web；若依赖 Electron 种子则留 electron + log 记。
- **删 electron/popup_theme**：web/popup_theme（T010）已有，electron 版重复删除。

## 非范围

- 不改 T010 基建 / mock / synthetic
- account_operations / plugin_failure_modes（T016 遗留，另 task）

## 验收标准

- [ ] settings_view web 可跑 case 迁 web/，electron 专属留 electron/
- [ ] popup_token_panel 决策（迁 web 或留 electron + log 记理由）
- [ ] electron/popup_theme 删除（web 版为准）
- [ ] `pnpm test:e2e:web` 全绿
- [ ] `pnpm test`（vitest）不受影响

## 依赖与约束

- 无

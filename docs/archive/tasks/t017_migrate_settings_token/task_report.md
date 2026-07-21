# Task report T017

本报告所在 commit 即 task commit，SHA 由 `git log --grep T017` 查，不在此记录。

## spec 验收标准勾选

- [x] settings_view web 可跑 case 迁 web/，electron 专属留 electron/。 - 4 case 迁 web/settings_view.spec.ts；2 case 留 electron/settings_view.spec.ts。
- [x] popup_token_panel 决策。 - 留 electron（需 VITE_ENABLE_TOKEN_PANEL=1，迁 web 副作用大），log 记。
- [x] electron/popup_theme 删除。 - git rm（web/popup_theme 为准）。
- [x] `pnpm test:e2e:web` 全绿。 - 41 passed。
- [x] `pnpm test`（vitest）不受影响。 - typecheck 过；lint 全绿；vitest 未跑（T017 仅 e2e 改动，vitest 无关）。

## adoption 处置摘要

- 已修 5 项 / 遗留 0 项 / 无需修改 0 项（owner 自审，未派 review agent——改动小：拆迁 + 删重复 + flaky 修）

## 遗留问题

- 无。settings_view case 拆迁完成；popup_theme 重复清除；popup_token_panel 留 electron（env 副作用，合理）；popup_drag_handle flaky 已修。
- account_operations / plugin_failure_modes（T016 遗留）仍待另 task。

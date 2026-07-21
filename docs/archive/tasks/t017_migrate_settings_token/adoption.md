# Adoption T017

owner 自审（机械拆迁 + 删重复 + flaky 修，范围小，未派 review agent）。

| 项                                      | 决策 | rationale                                                         | status |
| --------------------------------------- | ---- | ----------------------------------------------------------------- | ------ |
| settings_view case 1-4 迁 web           | 采纳 | sidebar/appearance 颜色样式，web SPA 有，openViaIpc→open_via_hash | 已修   |
| settings_view case 5-6 留 electron      | 采纳 | accounts `.acct-row` DOM + 用量标签映射字段，web SPA 无           | 已修   |
| 删 electron/popup_theme                 | 采纳 | web/popup_theme（T010）已有 + 多 case，重复                       | 已修   |
| popup_token_panel 留 electron           | 采纳 | 需 VITE_ENABLE_TOKEN_PANEL=1，迁 web 改全局 SPA DOM 副作用大      | 已修   |
| popup_drag_handle flaky 修（T016 遗留） | 采纳 | dragstart 时序敏感，增 steps + 显式 timeout                       | 已修   |

## 处置说明

- settings_view 拆迁：web 4 case（test_web + open_via_hash）/ electron 2 case（openViaIpc 保留）。
- popup_theme 删 electron 版（web 版为准）。
- popup_token_panel 留 electron + log 记理由（env 副作用）。
- popup_drag_handle flaky（T016 遗留）顺修：steps 15 + timeout 5s，41 passed 稳定。

注：T017 改动小（拆迁 + 删 + flaky 修），未派 2 agent review，owner 自审 + 全量验证（41 passed / typecheck / lint）。

# T8 Plan: 移除用量面板编辑

## 复杂度

**S**

## 改动文件

1. `ProviderAccountRow.tsx` — 去掉 edit menu 与 prop
2. `ProviderAccountList.tsx` — 去 `onEditAccount`
3. `ProviderCard.tsx` — 去 menu 编辑项与 prop
4. `ProviderOverview.tsx` — 去 prop 透传
5. `PopupView.tsx` — 删 `edit_account` 与传参
6. 测试：`provider_account_row` / `provider_card` / `popup_view` 中断言「编辑」的用例删除或改写

## Commit

```
refactor(ui): remove edit action from main panel menus
```

## 验证

`pnpm test` renderer；手工用量面板 ⋮ 无编辑，设置齿轮可用。

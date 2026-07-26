# T8 Spec: 取消用量面板编辑按钮

## 问题

用量面板账号/厂商菜单有「编辑」，跳转设置。用户要求取消用量面板编辑入口；改配置只走设置窗。

## 现状

| 入口           | 位置                                                | 行为                                                                            |
| -------------- | --------------------------------------------------- | ------------------------------------------------------------------------------- |
| 账号 ⋮「编辑」 | `ProviderAccountRow` + `onEditAccount`              | `PopupView.edit_account` → `settings.open({ instanceId, provider, accountId })` |
| 厂商 ⋮「编辑」 | `ProviderCard` menu 固定项                          | 同左或 `settings.open({ provider })`                                            |
| 传递链         | PopupView → Overview/Card/List/Row                  | `onEditAccount={edit_account}`                                                  |
| **保留**       | 托盘/用量面板设置齿轮、`settings.open()` 无 context | 进设置总页                                                                      |
| **保留**       | 设置页内编辑/删除/备注                              | 不变                                                                            |

## 期望

1. 用量面板账号菜单无「编辑」；若菜单空则隐藏 ⋮。
2. 用量面板厂商菜单无「编辑」；可保留「关闭」等非编辑项。
3. 删除 `onEditAccount` 传播与 `edit_account`（或内联死代码）。
4. 设置入口（齿轮、托盘「打开设置」）保留。

## 验收

1. 用量面板任意账号/厂商菜单无「编辑」。
2. 齿轮仍打开设置。
3. 设置页仍可编辑账号。

## 非目标

- 不改 `settings:navigate` 协议本身（其他入口可能用）。
- 不删设置页编辑。

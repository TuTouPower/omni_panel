# Adoption T025

owner 自审（electron restart 真跑验证 + selector 修）。

| 项                                | decision | rationale                                                                                     | status |
| --------------------------------- | -------- | --------------------------------------------------------------------------------------------- | ------ |
| electron restart case selector 修 | 采纳     | SettingsView 重构 .ao-item/.accent-row 改 .acct-list + filter DeepSeek text + getByTitle 编辑 | 已修   |
| electron restart 真跑             | 采纳     | 1 passed（2.8s 含 restart），secret 持久化验证                                                | 已修   |

## 处置说明

- T023 用 `.accent-row`（错误，是 appearance 页颜色行）。改 accounts row filter DeepSeek text + getByTitle 编辑（accounts 页直接显示 connector row，无 provider tabs）。
- restart 后 accounts nav + filter DeepSeek + 编辑 + API 密钥断言验证。
- 1 passed（14.2s）。

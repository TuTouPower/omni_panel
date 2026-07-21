# Adoption T023

owner 自审（拆迁 + class 同步，改动中等清晰，未派 review agent——同 T017 模式）。

| 项                                                    | decision | rationale                                                                 | status |
| ----------------------------------------------------- | -------- | ------------------------------------------------------------------------- | ------ |
| about logo/version 迁 web                             | 采纳     | web SPA .ah-logo/.ah-ver（原 .aa- 旧 class 改名）                         | 已修   |
| accounts case web skip                                | 采纳     | web SPA accounts .accent-row 不可见（DOM 差异），留 electron restart 覆盖 | 已修   |
| restart case 留 electron                              | 采纳     | web 无 restart 能力                                                       | 已修   |
| class 同步（.ao-item→.accent-row, .aa-logo→.ah-logo） | 采纳     | SettingsView 重构后 class 改名，spec 旧 class 失效（electron 也需同步）   | 已修   |

## 处置说明

- 发现 settings_provider_accounts spec 全部 class 过期（.aa-logo/.aa-ver/.ao-item → .ah-logo/.ah-ver/.accent-row，SettingsView 重构改名）。web + electron 都需同步。
- web：about 2 case（.ah-logo/.ah-ver，logo 只断 visible 不锁 src 因 web build hash/data URI）+ accounts 1 case（.accent-row 泛化，web 不可见时 skip）。
- electron：restart case 保留（.accent-row class 同步），删 about/accounts（web 覆盖）。
- accounts web skip：web SPA accounts 页 .accent-row 不渲染（mock fixture 或 web 简化），留 electron restart 覆盖 accounts 编辑表单。
- typecheck 过；real 45 passed + 1 skip / synthetic 44 + 2 skip。
- electron restart case 真跑未执行（需 Electron 慢），降级：文件存在 + class 对照 SettingsView L1697 + typecheck。

# connector-cpa-ui

> 验证方式：Web。拆自 connector-cpa（t037）。

CPA 账号的 UI 展示与交互。运行时契约见 `connector-cpa-runtime.md`；术语（直连 vs 聚合）见 `domain.md`。

## 所有权（CPA 隐藏，直连删除）

- **CPA 账号**：菜单"编辑 + 隐藏"。隐藏只写本地 `accountOverrides.hidden`，存在性由远端 CPA-Manager 决定，本地"删"了下次又回来。隐藏后用量面板消失、聚合排除、设置页可恢复。
- **直连账号**：菜单"编辑 + 删除"。删除连本地配置带 secret 一起清。

## 展示边界

- **用量面板**：无"CPA" tab，CPA 账号并入对应 provider 卡片。
- **设置页**：单一"已添加"列表不分区。CPA 行（N>1）带展开箭头，展开露账号子行；普通行（N=1）与一般直连无异。
- 操作按行层级：数据源主行含删除/改名/刷新；CPA 账号子行仅隐藏/改名。

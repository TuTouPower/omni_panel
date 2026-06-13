# 账号设置页与新版 design handoff 对齐说明

## 来源

- 新增设计对话：`docs/design/omni-usage/chats/chat43.md`、`docs/design/omni-usage/chats/chat44.md`
- 最终 demo 代码：
    - `docs/design/omni-usage/project/settings-panel.jsx`
    - `docs/design/omni-usage/project/settings-data.js`
    - `docs/design/omni-usage/project/settings-panel.css`

## 新 chat 结论

### `chat43.md`

该文件只有标题和开始时间，没有实际需求内容。

### `chat44.md`

这是本次 handoff 的有效来源。主题是“架构升级适配”，重点围绕架构文档 v2 §5.5.6 的展示边界，反复调整“设置 → 账号/已添加”页面。

最终定稿不是最初的“CPA 可折叠数据源行”，而是用户最后确认的结构：

1. 设置页不再按“普通用户 / CPA 用户”切换。
2. “已添加”列表里同时展示直连账号和 CPA Manager。
3. 多账号厂商不需要分组头，不需要拖动按钮，不需要厂商级按钮。
4. GLM / Codex 这类同一厂商多个账号，应显示为一张卡片里的多行账号；每行结构与单账号一致。
5. CPA Manager 也是一张卡片：第一行是 CPA 数据源行，下面是它发现的多个账号行。
6. CPA 不再有折叠按钮；CPA 下账号始终可见。
7. 设置页账号列表不显示用量信息。
8. 列表里取消“数据标签映射”独立按钮；标签映射放到“编辑”面板里。
9. CPA 子账号不能删除，只能改名 / 隐藏；来源已移除的账号可清除。
10. 普通直连账号行保留：开关 / 刷新 / 编辑 / 删除。

## demo 最终 UI 结构

### 账号列表

最终 demo 的 `CONNECTIONS` 数据是：

- `type: 'vendor'`：普通厂商连接。
    - 单账号厂商：一张卡，一行。
    - 多账号厂商：一张卡，多行。
- `type: 'cpa'`：CPA Manager。
    - 一张卡。
    - 第一行是 CPA 数据源行。
    - 后续多行是 CPA 发现的账号。

对应组件：

- `VendorCard`：厂商卡片。
- `AccountRow`：普通账号行，也复用给多账号厂商。
- `CpaCard`：CPA 卡片。
- `EditAccountDialog`：编辑账号，并内含数据标签映射。

### 普通账号行

每行展示：

- logo
- 厂商名
- 状态点
- 备注名
- 状态文案（仅异常时）
- 操作：开关 / 刷新 / 编辑 / 删除

不展示：

- 用量百分比
- token 数
- “更多”菜单
- 标签映射按钮
- 拖动手柄
- 分组头

### 多账号厂商

例如 GLM 两个账号：

- 一张卡里两行 GLM。
- 两行都像普通单账号行。
- 没有单独的 GLM header。
- 没有厂商级开关。
- 没有厂商级标签映射按钮。

### CPA Manager

CPA 卡片结构：

1. 第一行：CPA Manager 数据源行。
    - logo：CPA
    - 名称：CPA Manager
    - 标记：数据源
    - 摘要：`N 账号 · M 服务商`
    - 可展示失败计数：`N 个采集失败`
    - 操作：开关 / 刷新 / 编辑 / 删除
2. 后续行：CPA 发现的账号。
    - 每行展示对应厂商 logo、厂商名、状态点、账号备注。
    - 操作：改名 / 隐藏。
    - 来源已移除时显示清除。

CPA 子账号不应有删除按钮。因为账号存在性来自 CPA Manager，本地只能隐藏或清理已移除状态。

### 编辑面板

普通账号编辑面板需要包含：

- 备注名
- 接口地址（可选）
- 数据标签映射

标签映射从列表按钮移入编辑面板。列表页不再出现 tag 按钮。

### CPA 编辑页

Demo 的 CPA 编辑页是双栏结构：左侧连接配置，右侧已发现账号。

左侧包括：

- CPA-Manager URL
- API 密钥
- 连接状态：正常 / 上次同步
- 同步间隔
- 自动同步
- 同步失败通知
- 同步范围
- 保存
- 移除数据源

右侧包括：

- 已发现账号
- 按服务商分组展示账号
- 服务商组可折叠

当前项目的 `CpaConnectorSettings` 也有双栏、连接配置、同步范围、已发现账号，结构方向接近。但视觉和交互仍有差异：

- 当前顶部额外有“启用”配置行；demo 把启用放在账号列表 CPA 数据源行。
- 当前密钥输入没有 demo 的显示/隐藏眼睛按钮。
- 当前同步范围文案是“监控 Claude / 监控 Codex”，demo 是服务商名列表。
- 当前“已发现账号”每个服务商标题旁保留标签映射按钮入口；最终要求标签映射进编辑面板，不应作为列表旁独立按钮。
- 当前已发现账号展示 `accountId`，demo 只强调账号备注；是否展示 ID 需要再定。
- 当前详情页按服务商折叠，这一点 demo 仍保留，和账号列表取消折叠不是同一件事。

## 当前项目实现差异

当前项目已部分接近 demo，但还没完全对齐。

### 已接近

- 设置页左侧已经没有独立“数据源”导航。
- “已添加”页里已有添加按钮。
- 已有 `AddAccountDialog`，支持 api key / session / local 三类接入。
- 已有 `CpaConnectorSettings`，支持 CPA URL、管理密钥、同步范围、已发现账号。
- 已有 `LabelMapDialog` 和 `providerLabelMaps` / `accountLabelMaps` 配置字段。

### 主要不一致

1. 文案仍说“每一行都是一个已添加连接；CPA 连接可展开查看账号子项”。这不符合最终设计。最终是卡片 + 多行，CPA 不折叠。

2. 普通账号主行仍显示用量信息：`format_usage(items[0]) · 状态：...`。最终设计要求设置页账号列表不显示用量。

3. CPA 仍有展开按钮和 `open_cpa_rows` 状态。最终设计要求取消折叠，CPA 下账号始终显示。

4. CPA 子账号行仍显示用量信息：`format_usage(item)`。最终设计要求不显示用量。

5. CPA 子账号编辑目前打开 `LabelMapDialog`，实际语义是标签映射，不是“改名”。最终设计要求“改名/隐藏”，标签映射在编辑面板内。

6. `LabelMapDialog` 仍作为独立弹窗存在，并由账号列表触发。最终设计要求列表里没有标签映射按钮，映射进入编辑面板。

7. 多账号厂商在项目数据模型里表现为多个 plugin instance；UI 当前是每个 plugin 一张连接卡。最终设计希望同一厂商多个账号合并到一张卡，多行展示。

8. CPA Manager 详情页里的“已发现账号”仍按服务商折叠分组。demo 详情页也保留折叠；账号列表取消折叠，不等于详情页必须取消折叠。

9. CPA 编辑页和 demo 仍有明显差异：当前有独立“启用”行、密钥无显示/隐藏按钮、同步范围文案偏技术化、已发现账号标题旁仍可能出现标签映射按钮、账号行展示 accountId。需要单独对齐，不应只改账号列表。

## 建议实施范围

### 必改

1. 重做 `SettingsView` 的账号列表渲染。
    - 从 `config.plugins + pluginInfos` 生成 view model。
    - 按 provider 聚合同源直连账号。
    - CPA instance 单独生成 CPA 卡片。
    - 每个卡片渲染多行账号。

2. 移除账号列表用量文案。
    - 不在设置页账号列表调用 `format_usage`。
    - 状态只展示：正常 / 异常 / 未连接 / 已停用 / 已隐藏 / 来源已移除。

3. 移除 CPA 折叠交互。
    - 删除或停用 `open_cpa_rows`。
    - CPA 子账号始终显示。
    - 删除 CPA 行左侧展开按钮。
    - 更新 `acct-intro` 文案。

4. 调整账号行操作。
    - 直连账号：开关 / 刷新 / 编辑 / 删除。
    - CPA 数据源行：开关 / 刷新 / 编辑 / 删除。
    - CPA 子账号：改名 / 隐藏；来源已移除：清除。

5. 把标签映射放进编辑面板。
    - 普通账号编辑面板内嵌映射区域。
    - 不从账号列表直接打开 `LabelMapDialog`。
    - 保留现有映射存储字段：`accountLabelMaps` / `providerLabelMaps`，但入口改到编辑面板。

6. 对齐 CPA 编辑页。
    - 保留双栏：连接配置 / 已发现账号。
    - 密钥输入补显示/隐藏按钮。
    - 同步范围用服务商名，不用“监控 X”这种技术配置文案。
    - 移除已发现账号标题旁的标签映射按钮入口。
    - 账号行是否展示 accountId 需按产品口径定；默认先不展示，避免技术 ID 外露。

7. 更新 CSS。
    - 采用 demo 的“卡片 + 多行”结构。
    - 确保多账号厂商没有 header、没有拖动手柄。
    - 确保 CPA 卡片第一行和普通账号行视觉一致，但有“数据源”标识。

### 暂缓

1. CPA Manager 详情页的“已发现账号”分组折叠。
    - 最后一轮需求主要针对设置账号列表。
    - 详情页保留折叠更利于大量账号管理。

2. 标签映射作用域重构。
    - 用户说“同一个数据来源的所有标签映射都是一样的”。
    - 但当前实现同时有 provider 级和 account 级映射。
    - 可先入口迁移，后续再决定是否统一为 source/provider 级。

3. 本地 CLI 扫描真实实现。
    - demo 只是设计。
    - 当前项目已有本地授权能力的其他改造，账号页对齐不应顺手扩展后端能力。

## 数据建模建议

渲染层先构造三个 view model：

```ts
type direct_account_row = {
    kind: "direct_account";
    instance_id: string;
    provider: UsageProvider;
    account_id: string;
    account_label: string;
    enabled: boolean;
    status: "ok" | "error" | "auth" | "disabled" | "unknown";
};

type vendor_card = {
    kind: "vendor_card";
    provider: UsageProvider;
    rows: direct_account_row[];
};

type cpa_card = {
    kind: "cpa_card";
    instance_id: string;
    enabled: boolean;
    status: "ok" | "partial" | "error" | "disabled" | "unknown";
    rows: cpa_account_row[];
};
```

构造规则：

- 直连 plugin：按 `activeProviders[0]` 聚合到 `vendor_card`。
- CPA plugin：生成一个 `cpa_card`。
- CPA rows 来自 CPA snapshot items。
- 同一 CPA provider 下多个账号不需要再分组；直接多行展示。
- 隐藏状态来自 `accountOverrides.hidden[provider].includes(accountId)`。

## 成功标准

1. 设置账号页不显示任何用量数字、进度条、token 统计。
2. GLM / Codex 等多账号厂商显示为一张卡多行，而不是多个分散卡片，也不是带 header 的分组。
3. CPA Manager 无折叠按钮；账号子行始终展示。
4. 账号列表没有标签映射按钮。
5. 普通账号行操作为：开关 / 刷新 / 编辑 / 删除。
6. CPA 数据源行操作为：开关 / 刷新 / 编辑 / 删除。
7. CPA 子账号行操作为：改名 / 隐藏；来源已移除时可清除。
8. 编辑面板包含标签映射区域。
9. CPA 编辑页视觉和交互与 demo 对齐：密钥可显隐、同步范围是服务商列表、无独立标签映射按钮、不外露不必要技术 ID。
10. `pnpm test` 通过。
11. 手工打开设置页，验证添加、编辑、隐藏、删除、CPA 展示关键路径。

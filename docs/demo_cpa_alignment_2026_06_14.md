# Demo CPA 设置对齐说明（2026-06-14）

## 范围

只对齐本次 demo 更新中明确变更的设置页设计；其他前端设计不扩展分析。重点是 CPA Manager 编辑界面，因为当前实现此前未对齐。

参考来源：

- `docs/design/omni-usage/chats/chat47.md`
- `docs/design/omni-usage/project/settings-panel.jsx`
- `docs/design/omni-usage/project/settings-data.js`

当前实现参考：

- `src/renderer/views/SettingsView.tsx`
- `src/renderer/components/CpaCard.tsx`
- `src/renderer/components/AccountRow.tsx`
- `src/renderer/components/CpaConnectorSettings.tsx`
- `src/renderer/components/LabelMapDialog.tsx`
- `src/renderer/components/SettingsForm.tsx`

## 本次 demo 更新了什么

### 1. 账号页 CPA 卡片

Demo 变更：

- CPA Manager 行不再显示“数据源”标签。
- CPA 子账号行不再有“编辑”按钮。
- CPA 子账号行不再用“隐藏”眼睛按钮，改成和主面板一致的开关。
- CPA 子账号关闭后显示“已关闭”。
- CPA 子账号来源移除时保留“清除”按钮。
- 支持多个 CPA Manager，每个 CPA Manager 作为独立数据源卡片展示，名称来自自身别名，例如“公司 CPA”“个人 CPA”。

当前实现差距：

- `src/renderer/components/CpaCard.tsx:61` 固定显示 `CPA Manager`，没有使用实例别名。
- `src/renderer/components/CpaCard.tsx:62` 仍显示 `数据源` 标签。
- `src/renderer/components/AccountRow.tsx:106` 对 `cpa-source` 也会显示 `数据源` 标签。
- `src/renderer/components/AccountRow.tsx:124-135` CPA 子账号仍是“改名 + 隐藏眼睛”两个图标。
- `src/renderer/components/AccountRow.tsx:55` 隐藏状态文案是“已隐藏”，demo 要“已关闭”。
- `src/renderer/views/SettingsView.tsx:1412-1422` 当前把 CPA 子账号的 `on_rename` 接到了标签映射弹窗，这与 demo 的“子账号行不要编辑按钮”冲突。

对齐要求：

- CPA 卡片标题使用插件实例显示名 / 配置名，不固定写死 `CPA Manager`。
- 删除 CPA 卡片和 `cpa-source` 行里的“数据源”标签。
- CPA 子账号行只保留：
    - 正常/关闭：一个 `sw` 开关；
    - 来源已移除：一个“清除”按钮。
- 子账号开关继续写入 `accountOverrides.hidden`，只是 UI 文案和控件从“隐藏”改成“关闭”。
- 移除 CPA 子账号行级标签映射入口；标签映射入口移动到 CPA 详情的“同步范围”。

### 2. CPA Manager 编辑界面

Demo 变更：

- CPA 详情页仍是双栏：左侧配置，右侧已发现账号。
- 左侧“连接配置”新增“别名”。
- 保留 `CPA-Manager URL`、`API 密钥`、连接状态。
- 删除“自动同步”。
- 删除“同步失败通知”。
- “同步设置”改为“刷新”。
- 使用“跟随全局自动刷新间隔”开关。
- 开关关闭后才显示“该数据源刷新频率”。
- 文案需要显示当前全局值，例如：`当前全局为「5 分钟」自动刷新`。
- 同步范围每个厂商行都有：编辑数据标签映射按钮 + 开关。
- 右侧“已发现账号”继续按服务商分组折叠展示。

当前实现差距：

- `src/renderer/components/CpaConnectorSettings.tsx:239-277` 只有 URL 和 API 密钥，没有“别名”。
- `src/renderer/components/CpaConnectorSettings.tsx:286-342` 仍是“同步设置 / 同步间隔 / 自动同步 / 同步失败通知”。
- `src/renderer/components/CpaConnectorSettings.tsx:344-367` 同步范围只有开关，没有编辑标签映射按钮。
- `src/renderer/components/CpaConnectorSettings.tsx:89-96` 已接收 `providerLabelMaps` 和 `onEditLabelMap`，但当前直接丢弃。
- `src/renderer/views/SettingsView.tsx:356-391` 渲染 CPA 设置时没有传 `onEditLabelMap`。
- `src/renderer/views/SettingsView.tsx:801-812` 已有全局刷新间隔 `interval_label`，可用于传给 CPA 设置展示当前全局值。

对齐要求：

- 在 CPA 设置左栏添加“别名”字段，保存到对应插件实例名。
- 把 CPA 设置中的刷新 UI 改成和普通账号编辑一致的结构：
    - `跟随全局自动刷新间隔` 开关；
    - 开启时只显示当前全局刷新间隔说明；
    - 关闭时才显示频率选择。
- 删除 `autoSync` / `failNotify` 本地状态和 UI。
- 同步范围行在开关左侧增加编辑按钮，点击打开现有 `LabelMapDialog`。
- `CpaConnectorSettings` 不应再丢弃 `onEditLabelMap`，应在同步范围编辑按钮中调用。
- `SettingsView` 负责设置 `label_map_dialog`，保存目标应使用 `save_target: "provider"`。
- 右侧已发现账号分组保持现有实现即可。

### 3. 数据标签映射入口

Demo 变更：

- 普通账号编辑里仍可编辑数据标签映射。
- CPA Manager 的标签映射入口不在子账号行，而在 CPA 详情的“同步范围”厂商行。
- 弹窗文案是“数据标签映射”，副标题为服务商名称。
- 有数据时显示两列：`原始标签（来自接口）` / `显示名称`。
- 无数据时显示“该服务商暂无可映射的数据标签”。

当前实现可复用：

- `src/renderer/components/LabelMapDialog.tsx` 已有独立弹窗、加载状态、空状态、保存逻辑。
- `src/renderer/views/SettingsView.tsx:700-705` 已有 `label_map_dialog` 状态。
- `src/renderer/views/SettingsView.tsx:1415-1421` 已能打开 CPA 账号标签映射，但入口位置错。

对齐要求：

- 复用现有 `LabelMapDialog`。
- CPA 详情同步范围编辑按钮打开：
    - `instance_id`: 当前 CPA 插件实例 id；
    - `vendor_id`: 对应同步范围厂商；
    - `account_name`: 服务商显示名；
    - `save_target`: `provider`。
- 不再从 CPA 子账号行打开标签映射。

### 4. 两个 CPA Manager 场景

Demo 变更：

- `settings-data.js` 新增第二个 CPA Manager 场景。
- 两个 CPA Manager 独立展示：各自别名、URL、同步范围、刷新设置、已发现账号。
- 详情页根据打开的 CPA 连接切换数据，不共用静态状态。

当前实现情况：

- `src/renderer/views/SettingsView.tsx:1313-1448` 已按 `config.plugins` 渲染多个 CPA 插件实例，基础列表支持多个。
- 但 `src/renderer/components/CpaCard.tsx:61` 标题固定，无法区分多个 CPA。
- CPA 详情由 `AccountDialog` 直接编辑当前实例，实例隔离基本具备；缺少别名字段和同步范围标签映射入口。

对齐要求：

- 多 CPA 的视觉区分依赖实例别名，必须先补别名显示与保存。
- CPA 详情组件状态应在 `connector.instanceId` 切换时重置，当前 `useEffect` 已覆盖主要字段，补别名时也要加入重置。

## 建议实施顺序

1. 更新 CPA 卡片和子账号行：去标签、标题用别名、子账号按钮改开关、文案改“已关闭”。
2. 更新 CPA 详情表单：加别名，删除自动同步/失败通知，刷新设置改为“跟随全局”。
3. 打通 CPA 同步范围的标签映射编辑按钮，复用 `LabelMapDialog`。
4. 补测试：
    - CPA 卡片不显示“数据源”；
    - CPA 子账号只显示开关，不显示编辑/隐藏按钮；
    - CPA 详情显示别名和跟随全局刷新开关；
    - 关闭跟随全局后才显示数据源刷新频率；
    - 同步范围编辑按钮打开 provider 级标签映射；
    - 两个 CPA 插件实例显示不同别名。
5. 手工验证设置页：账号列表、CPA 编辑页、同步范围标签映射弹窗、多 CPA 显示。

## 非本次范围

- 不对 demo 删除的大量截图、上传资源做 UI 推断。
- 不改 `docs/design/omni-usage/` demo 源文件。
- 不重做普通账号编辑；只在它与 CPA 详情对齐有关时复用结构和文案。

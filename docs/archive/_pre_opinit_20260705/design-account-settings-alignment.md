# design handoff 对齐说明

## 来源

### 账号设置页（chat43 / chat44）

- 设计对话：`docs/design/omni-usage/chats/chat43.md`、`docs/design/omni-usage/chats/chat44.md`
- 最终 demo 代码：
    - `docs/design/omni-usage/project/settings-panel.jsx`
    - `docs/design/omni-usage/project/settings-data.js`
    - `docs/design/omni-usage/project/settings-panel.css`

### 主面板 UI + 关于页 + 托盘（chat45）

- 设计对话：`docs/design/omni-usage/chats/chat45.md`
- 最终 demo 代码：
    - `docs/design/omni-usage/project/app.jsx`
    - `docs/design/omni-usage/project/components.jsx`
    - `docs/design/omni-usage/project/tray.jsx`
    - `docs/design/omni-usage/project/settings-panel.jsx`（关于页部分）
    - `docs/design/omni-usage/project/omniusage.css`

### chat46

全部撤销，无需求。

---

## 一、账号设置页（chat43 / chat44）

### chat43 结论

该文件只有标题和开始时间，没有实际需求内容。

### chat44 结论

主题是"架构升级适配"，重点围绕架构文档 v2 §5.5.6 的展示边界，反复调整"设置 → 账号/已添加"页面。

最终定稿：

1. 设置页不再按"普通用户 / CPA 用户"切换。
2. "已添加"列表里同时展示直连账号和 CPA Manager。
3. 多账号厂商不需要分组头，不需要拖动按钮，不需要厂商级按钮。
4. GLM / Codex 这类同一厂商多个账号，应显示为一张卡片里的多行账号；每行结构与单账号一致。
5. CPA Manager 也是一张卡片：第一行是 CPA 数据源行，下面是它发现的多个账号行。
6. CPA 不再有折叠按钮；CPA 下账号始终可见。
7. 设置页账号列表不显示用量信息。
8. 列表里取消"数据标签映射"独立按钮；标签映射放到"编辑"面板里。
9. CPA 账号不能删除，只能改名 / 隐藏；来源已移除的账号可清除。
10. 普通直连账号行保留：开关 / 刷新 / 编辑 / 删除。

### demo 最终 UI 结构

#### 账号列表

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

#### 普通账号行

每行展示：logo / 厂商名 / 状态点 / 备注名 / 状态文案（仅异常时）/ 操作：开关 / 刷新 / 编辑 / 删除。

不展示：用量百分比 / token 数 / "更多"菜单 / 标签映射按钮 / 拖动手柄 / 分组头。

#### 多账号厂商

例如 GLM 两个账号：一张卡里两行，两行都像普通单账号行，没有单独的 GLM header、没有厂商级开关、没有厂商级标签映射按钮。

#### CPA Manager

CPA 卡片结构：

1. 第一行：CPA Manager 数据源行。
    - logo：CPA / 名称：CPA Manager / 标记：数据源
    - 摘要：`N 账号 · M 服务商`；可展示失败计数：`N 个采集失败`
    - 操作：开关 / 刷新 / 编辑 / 删除
2. 后续行：CPA 发现的账号。
    - 每行展示对应厂商 logo、厂商名、状态点、账号备注。
    - 操作：改名 / 隐藏。来源已移除时显示清除。

CPA 账号不应有删除按钮。

#### 编辑面板

普通账号编辑面板：备注名 / 接口地址（可选）/ 数据标签映射。标签映射从列表按钮移入编辑面板。

#### CPA 编辑页

双栏结构：左侧连接配置（CPA-Manager URL / API 密钥 / 连接状态 / 同步间隔 / 自动同步 / 同步失败通知 / 同步范围 / 保存 / 移除数据源），右侧已发现账号（按服务商分组展示，服务商组可折叠）。

### 当前项目实现差异

#### 已接近

- 设置页左侧已经没有独立"数据源"导航。
- "已添加"页不再渲染通用新增账号弹窗；账号编辑只打开对应连接器的编辑面板。
- `AddAccountDialog` 组件仍保留给独立新增流程测试，但设置页账号列表不再直接入口。
- 已有 `CpaConnectorSettings`，支持 CPA URL、管理密钥、同步范围、已发现账号。
- 已有 `LabelMapDialog` 和 `providerLabelMaps` / `accountLabelMaps` 配置字段；主面板显示按用户映射覆盖连接器默认标签。

#### 主要不一致

1. ~~文案仍说"每一行都是一个已添加连接；CPA 连接可展开查看账号子项"~~ → 已改为"直连厂商以卡片展示；CPA Manager 自动聚合多个服务商账号"。
2. ~~普通账号主行仍显示用量信息~~ → 已移除，设置页账号列表不显示用量。
3. ~~CPA 仍有展开按钮和 `open_cpa_rows` 状态~~ → 已删除，CPA 账号始终显示。
4. ~~CPA 账号行仍显示用量信息~~ → 已移除。
5. ~~CPA 账号编辑目前打开 `LabelMapDialog`，实际语义是标签映射。最终设计要求"改名/隐藏"，标签映射在编辑面板内。~~ → CPA 账号改名已实现：`RenameAccountDialog` 弹窗编辑备注名，写入 `accountLabels[provider][accountId]`，`AccountRow` cpa-child 模式有改名按钮。
6. ~~`LabelMapDialog` 仍作为独立弹窗存在~~ → 仅保留 CPA 账号"改名"入口；直连账号编辑面板内已无独立标签映射按钮。
7. ~~多账号厂商 UI 当前是每个 plugin 一张连接卡~~ → 已按 provider 聚合为 `VendorCard`。
8. CPA Manager 详情页里的"已发现账号"仍按服务商折叠分组。demo 详情页也保留折叠；账号列表取消折叠。（保留，见暂缓项）
9. ~~CPA 编辑页和 demo 仍有明显差异~~ → 已对齐：密钥补显示/隐藏按钮、同步范围用服务商名、移除标签映射按钮、账号行不展示 accountId。
10. 导航标签"已添加"应改为"账号"（demo 用"账号"）。
11. AccountDialog header 缺少 VendorMark 图标（demo 在标题前显示厂商 logo）。
12. SettingsForm 顶部冗余显示插件名（AccountDialog header 已有），且字段标签用 `cfg-label` 而非 `ad-label`。
13. SettingsForm footer 用 `cf-save` 而非 demo 的 `ad-btn primary` + `ad-btn ghost` 取消按钮。
14. SettingsForm 未使用 `label@zh-Hans` 本地化标签，导致"Amount Limit"等英文显示。
15. SettingsForm 密码字段已有密钥时显示固定 `"***"`，应按实际密钥长度显示对应数量的点。
16. 数据标签映射 `.lm-raw` 列宽度不足，原始标签被挤占。

### 建议实施范围

#### 必改

1. ✅ 重做 `SettingsView` 的账号列表渲染。
    - 从 `config.plugins + pluginInfos` 生成 view model。
    - 按 provider 聚合同源直连账号。
    - CPA instance 单独生成 CPA 卡片。
    - 每个卡片渲染多行账号。
2. ✅ 移除账号列表用量文案。
    - 不在设置页账号列表调用 `format_usage`。
    - 状态只展示：正常 / 异常 / 未连接 / 已停用 / 已隐藏 / 来源已移除。
3. ✅ 移除 CPA 折叠交互。
    - 删除 `open_cpa_rows` 和 `toggle_cpa_row`。
    - CPA 账号始终显示。
    - 删除 CPA 行左侧展开按钮。
    - 更新 `acct-intro` 文案。
4. ✅ 调整账号行操作。
    - 直连账号：开关 / 刷新 / 编辑 / 删除。
    - CPA 数据源行：开关 / 刷新 / 编辑 / 删除。
    - CPA 账号：改名 / 隐藏；来源已移除：清除。
5. 部分完成：把标签映射放进编辑面板。
    - ✅ 普通账号列表已无独立标签映射按钮。
    - ✅ CPA 编辑页已移除标签映射按钮。
    - ⬜ 标签映射内嵌到普通账号编辑面板内（暂缓，当前仅 CPA 账号"改名"入口保留 LabelMapDialog）。
6. ✅ 对齐 CPA 编辑页。
    - 保留双栏：连接配置 / 已发现账号。
    - ✅ 密钥输入补显示/隐藏按钮。
    - ✅ 同步范围用服务商名，不用"监控 X"这种技术配置文案。
    - ✅ 移除已发现账号标题旁的标签映射按钮入口。
    - ✅ 账号行不展示 accountId。
7. ✅ 更新 CSS。
    - 采用 demo 的"卡片 + 多行"结构。
    - 确保多账号厂商没有 header、没有拖动手柄。
    - 确保 CPA 卡片第一行和普通账号行视觉一致，但有"数据源"标识。

#### 暂缓

1. CPA Manager 详情页的"已发现账号"分组折叠。
    - 最后一轮需求主要针对设置账号列表。
    - 详情页保留折叠更利于大量账号管理。
2. 标签映射作用域重构。
    - 用户说"同一个数据来源的所有标签映射都是一样的"。
    - 但当前实现同时有 provider 级和 account 级映射。
    - 可先入口迁移，后续再决定是否统一为 source/provider 级。
3. 本地 CLI 扫描真实实现。
    - demo 只是设计。
    - 当前项目已有本地授权能力的其他改造，账号页对齐不应顺手扩展后端能力。

### 数据建模建议

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

### 成功标准（chat43/44）

1. 设置账号页不显示任何用量数字、进度条、token 统计。
2. GLM / Codex 等多账号厂商显示为一张卡多行，而不是多个分散卡片，也不是带 header 的分组。
3. CPA Manager 无折叠按钮；账号子行始终展示。
4. 账号列表没有标签映射按钮。
5. 普通账号行操作为：开关 / 刷新 / 编辑 / 删除。
6. CPA 数据源行操作为：开关 / 刷新 / 编辑 / 删除。
7. CPA 账号行操作为：改名 / 隐藏；来源已移除时可清除。
8. 编辑面板包含标签映射区域。
9. CPA 编辑页视觉和交互与 demo 对齐：密钥可显隐、同步范围是服务商列表、无独立标签映射按钮、不外露不必要技术 ID。
10. `pnpm test` 通过。
11. 手工打开设置页，验证添加、编辑、隐藏、删除、CPA 展示关键路径。

---

## 二、主面板 UI + 关于页 + 托盘（chat45）

### chat45 结论

主题是"主面板 UI 优化"，批量调整标签栏、关于页、MiMo 认证文案、系统托盘。

最终定稿：

1. 去掉总览右边的分隔竖线。
2. 总览和厂商标签必须在同一行对齐。根因：长标签（如 Brave Search）换行把整行撑高、底对齐把总览顶下去。改法：顶对齐 + 标签单行省略号。
3. 鼠标在标签栏滚动，选中框一格一格跳到下一个/上一个厂商，不是自由滚动。
4. 滚动可循环：最后一个厂商往下滚跳回总览，总览往上滚跳到最后一个厂商。
5. 总览图标始终蓝色，无论选中与否。
6. 网页登录类服务（MiMo / Kimi）失效显示"登录失效"，密钥/本地类显示"凭证失效"。
7. 关于页重做：Logo、名称、版本、简介，下面一排按钮：官网 / 文档 / 问卷反馈 / 检查更新（蓝色主按钮）/ 支持作者（❤）。
8. 系统托盘加"问卷反馈"和"支持作者"两项。

### demo 最终 UI 结构

#### 标签栏

- 总览按钮和厂商标签之间没有竖线分隔。
- 所有标签顶部对齐（`align-items: flex-start`），不是底部对齐。
- 标签文字超长时单行截断加省略号，不换行。
- 鼠标滚轮在标签栏区域滚动时切换标签，每次跳一格，200ms 防抖。
- 循环：最后一个 → 总览 → 第一个 ↔ 反向同理。
- 总览图标用 `color="var(--blue)"` 硬编码，不随选中状态变色。

demo 代码关键路径：

- `app.jsx`：`tabWrapRef` 上挂 `wheel` 事件，`tabOrder = ['overview', ...VENDORS.map(v => v.id)]`，`((i + dir) % n + n) % n` 循环。
- `app.jsx`：总览按钮 `<Icon name="grid_nav" size={22} color="var(--blue)" strokeWidth={1.8} />`，恒蓝。
- `app.jsx`：标签栏 `.tabs-wrap` 用 `align-items: flex-end` → demo 改成 `align-items: flex-start`。
- `omniusage.css`：`.tab .tab-lbl` 无 `overflow: hidden` 或 `text-overflow: ellipsis` → demo 需要加。

#### MiMo 认证文案

demo 的 `components.jsx` 里 `UsageCard` 组件根据 `vendorId` 查 `VENDOR_AUTH` 映射：

```js
const authKind =
    (vendorId && window.VENDOR_AUTH && window.VENDOR_AUTH[vendorId]) || authType || "apikey";
const authWord = authKind === "session" ? "登录" : "凭证";
```

- `session` 类（MiMo / Kimi）→ "登录失效，请重新登录"
- `apikey` / `local` 类 → "凭证失效，请重新登录"

当前项目 `AddAccountDialog.tsx` 已有 `VENDOR_AUTH_MAP` 区分 auth method（`mimo: "session"`, `kimi: "session"`）。但 `ProviderCard.tsx` 仍统一写"凭证失效"，没有根据 auth method 区分。

#### 关于页

demo 的 `settings-panel.jsx` 关于页结构：

```
about-app:
  logo (56x56)
  "OmniUsage"
  "版本 1.4.2 · 已是最新版本"
  [检查更新] (btn-primary)

about-links (一排按钮，非列表):
  官网 | 文档 | 问卷反馈 | 检查更新 | 支持作者
```

- 官网、文档、问卷反馈：普通链接样式
- 检查更新：蓝色主按钮（`btn-primary`），云图标
- 支持作者：心形图标

当前项目的关于页是列表式：更新日志 / 开源许可 / 反馈问题 / 访问官网，都是 `SetRow` + chevron 的列表行样式，且都标"即将推出"。需要改为 demo 的一排按钮布局。

#### 系统托盘

demo 的 `tray.jsx` 菜单项顺序：

1. 打开主面板
2. 立即刷新全部
3. — separator —
4. 暂停自动刷新（可勾选）
5. 开机自启（可勾选）
6. — separator —
7. 设置…
8. 检查更新（带版本号 meta）
9. **问卷反馈** ← 新增
10. **支持作者** ← 新增
11. — separator —
12. 退出 OmniUsage

当前项目的 `TrayMenu.tsx` 缺少"问卷反馈"和"支持作者"。

### 建议实施范围

#### 必改

1. 去掉总览右边的竖线。
    - 删除 `ProviderNav.tsx` 中的 `<div className="tabs-pin-divider" />`。
    - 删除 CSS 中 `.tabs-pin-divider` 规则。

2. 修复标签栏对齐。
    - `.tabs-wrap` 的 `align-items` 从 `flex-end` 改为 `flex-start`。
    - `.tab .tab-lbl` 加 `overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%;`，防止长标签换行。

3. 加标签栏滚轮切换。
    - 在 `PopupView.tsx` 的 `.tabs-wrap` 元素上挂 `wheel` 事件。
    - 200ms 防抖，每次切换一个标签。
    - 循环：最后一个 → 总览，总览 → 最后一个。

4. 总览图标恒蓝。
    - `ProviderNav.tsx` 中总览的 `VendorMark` 或 `Icon` 始终传 `color="var(--blue)"`。
    - 不应随 `.active` 状态变色——未选中时也是蓝色。

5. MiMo 认证文案区分。
    - `ProviderCard.tsx` 的 auth 状态文案根据 `VENDOR_AUTH_MAP[provider]` 判断：
        - `session` → "登录失效，请重新登录"
        - `apikey` / `local` / 其他 → "凭证失效，请重新登录"
    - ~~`PopupView.tsx` 状态栏 `derive_status_bar` 里的 "凭证失效"~~（底部状态栏已移除，`derive_status_bar` 已删除）

6. 关于页重做。
    - 改为 demo 的布局：logo / 名称 / 版本 / 检查更新按钮，下方一排按钮：官网 / 文档 / 问卷反馈 / 检查更新 / 支持作者。
    - 移除当前的列表式 `SetRow`（更新日志 / 开源许可 / 反馈问题 / 访问官网）。
    - 按钮用 icon + 文字的 inline 布局，`white-space: nowrap`。

7. 系统托盘加两项。
    - `TrayMenu.tsx` 在"检查更新"之后、"退出"之前加两个 `CtxItem`：问卷反馈 / 支持作者。
    - 需要确认后端 IPC 是否已有对应 action（`feedback` / `support_author`），没有的话加占位。

#### 暂缓

无。

### 成功标准（chat45）

1. 总览右边没有竖线。
2. 总览和所有厂商标签在同一水平线对齐，长标签截断不换行。
3. 鼠标滚轮在标签栏可以逐个切换标签，支持首尾循环。
4. 总览图标无论选中与否都是蓝色。
5. MiMo / Kimi 类服务失效时显示"登录失效"，其他服务显示"凭证失效"。
6. 关于页显示：logo、名称、版本、检查更新按钮，下方一排：官网 / 文档 / 问卷反馈 / 检查更新 / 支持作者。
7. 系统托盘包含"问卷反馈"和"支持作者"两项。
8. 常规页"其他"分组包含"同一数据源的数据标签映射同步"开关（demo settings-panel.jsx L811）。
9. `pnpm test` 通过。
10. 手工验证：标签切换、滚轮循环、MiMo 失效文案、关于页布局、托盘菜单、标签映射同步开关。

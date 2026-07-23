# 当前前端与设计 Demo 差异

生成日期：2026-06-03

目标：对齐 `docs/design/omni-usage/` 设计 demo。

说明：Token 面板暂时关闭是用户命令，不计入差异。

## 参考源

- 当前前端：`src/renderer/views/PopupView.tsx`、`src/renderer/views/SettingsView.tsx`、`src/renderer/components/ProviderCard.tsx`、`src/renderer/styles/globals.css`
- 当前窗口/托盘行为：`src/main/index.ts`、`src/main/core/popup/popup-height-controller.ts`
- 设计 demo：`docs/design/omni-usage/project/OmniUsage UI.html`、`docs/design/omni-usage/project/app.jsx`、`docs/design/omni-usage/project/OmniUsage Settings.html`、`docs/design/omni-usage/project/settings-panel.jsx`、`docs/design/omni-usage/project/settings-panel.css`
- 设计沟通：`docs/design/omni-usage/chats/chat1.md` 到 `chat20.md`
- 关键 demo 提交：`39940ed docs: update design demo with latest handoff`、`a18a682 docs: update design demo with settings panel and move demo_todo to archive`

## 总体结论

当前前端已接近 demo 的主面板基础结构：托盘弹窗、顶部标题栏、provider tab、用量卡片、刷新、折叠、拖拽、多账号概览/明细、空/加载/错误/凭证失效状态、浅/深色主题、动态高度都已有实现。

主要未对齐点集中在设置体系：demo 已把设置设计成独立窗口，并补全了 CPA 用户、数据源、CPA Manager 详情、添加账号 picker、CPA 来源账号隐藏逻辑；当前实现仍是同一个 popup 内 hash 路由的设置页，且数据源/添加流程/CPA 来源差异化不足。

## 差异清单

| 优先级 | 模块                  | Demo 目标                                                                                                    | 当前实现                                                                               | 差异 / 待对齐                                                                        |
| ------ | --------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| P0     | 设置打开方式          | 主面板设置按钮打开独立 `OmniUsage Settings.html` 风格窗口，不替换主面板。                                    | `PopupView` 设置按钮切到 `#settings`；主进程右键“设置”也是复用 popup 并切 hash。       | 需要独立 settings `BrowserWindow`，主面板保持存在。                                  |
| P0     | 设置窗口尺寸与结构    | 独立 820/900px 级两栏设置窗口，左侧导航、右侧内容，顶部返回可关闭窗口。                                      | 设置页包在 460px popup `.window` 内，走同一 renderer route。                           | 需要独立窗口布局和尺寸，不应受 popup 小窗限制。                                      |
| P0     | 数据源导航            | CPA 用户左侧显示“数据源”；普通用户不显示。                                                                   | `NAV_ITEMS` 没有数据源项。                                                             | 需要按 CPA 场景显示数据源入口。                                                      |
| P0     | CPA Manager 数据源页  | 数据源页展示 CPA Manager 卡片：URL、状态、发现账号数、覆盖服务商、上次同步、同步/编辑/更多。                 | CPA 插件只作为账号组里的插件配置入口。                                                 | 缺独立数据源列表页。                                                                 |
| P0     | CPA Manager 详情页    | 有连接配置、API Key 显示/隐藏、连接状态、同步间隔、自动同步、失败通知、同步范围、已发现账号分组、保存/移除。 | `CpaConnectorSettings` 只覆盖 endpoint/key/provider switches 等基础设置。              | 缺完整 CPA Manager 详情信息架构。                                                    |
| P0     | 添加账号流程          | 点击添加先进入服务选择 picker；常用服务 + 高级 CPA Manager；再进入对应表单。                                 | add mode 多数显示“暂不支持在此添加新账号”。                                            | 添加账号流程未做。                                                                   |
| P0     | CPA 来源账号操作      | CPA 来源账号标记“来自 CPA Manager”；操作是隐藏，不是删除；直接添加账号才删除。                               | CPA 来源显示为 `CPA · 服务名`，但仍有删除按钮，删除会移除 plugin 配置。                | 需要区分来源、隐藏/删除语义。                                                        |
| P1     | 普通 / CPA 用户模式   | demo 有普通用户和 CPA 用户两套账号管理视图。                                                                 | 当前根据真实 config/plugin 聚合，没有明确 CPA 用户视图模式。                           | 需要产品态定义：何时显示 CPA 模式、如何混合直接账号和 CPA 来源账号。                 |
| P1     | 账号页单/多账号布局   | 单账号厂商一行展示；多账号厂商分组展示；CPA 来源 badge 在行内操作区。                                        | 当前所有账号按 provider group + rows 展示，单账号也放在 group 中。                     | 需要更贴近 demo 的账号页信息密度和分组规则。                                         |
| P1     | 设置页视觉            | demo 设置窗口使用 `settings-panel.css`：更宽、留白更稳定、侧栏和内容区更像产品设置中心。                     | 当前设置页已两栏，但压在小 popup 中，样式更像主面板扩展页。                            | 需要迁移为独立设置视觉体系。                                                         |
| P1     | 主面板设置入口行为    | demo 空状态“添加服务”和 titlebar 设置都打开独立设置窗口。                                                    | 空状态和设置按钮切换当前 hash。                                                        | 跟 P0 设置独立窗口一起改。                                                           |
| P1     | 托盘设置行为          | demo tray 的“设置”打开独立设置窗口。                                                                         | 主进程托盘菜单“设置”复用 popup 并切 `#settings`。                                      | 需要托盘菜单创建/聚焦 settings 窗口。                                                |
| P1     | 主面板最大高度        | demo 高度 clamp 到屏幕 75%。                                                                                 | 主进程高度控制使用工作区 85%。                                                         | 若严格对齐 demo，应改为 75%。                                                        |
| P1     | provider 关闭后的归属 | demo 关闭卡片后主面板不显示，设置里恢复。                                                                    | 当前主面板本地 `disabled_providers` 隐藏/显示，不持久；设置页插件 enabled 可持久关闭。 | 需要统一主面板关闭与设置页 enabled 的数据来源。                                      |
| P1     | 删除 provider         | demo 删除从当前 tab 范围移除。                                                                               | 当前 `delete_provider` 只写日志，未实现。                                              | 需要决定删除语义：删除账号/插件配置，还是只移除 demo 级视图。                        |
| P2     | 真实品牌标识          | demo 使用统一 `VendorMark` 风格；当前项目已有真实 logo 资源但主 UI 多数还是占位几何标识。                    | 当前视觉可用，但品牌识别不完全。                                                       | 需决定按 demo 占位风格还是切真实 logo。                                              |
| P2     | 设置 Tweaks           | demo 的 Tweaks 可切普通/CPA 用户、主题、强调色，是设计验收工具。                                             | 当前生产前端无 Tweaks。                                                                | 不一定要做；若用于验收，可做开发态/设计态入口。                                      |
| P2     | demo 极端状态预览     | demo 可切 default/limit/refreshing/error/auth/empty。                                                        | 当前依赖真实插件状态和测试数据。                                                       | 生产无需完全照搬；若要设计验收，需要 story/demo 模式。                               |
| P2     | 托盘窗口视觉 demo     | demo 有独立窄托盘窗口 `TrayWindow` 作为视觉预览。                                                            | 生产使用 Electron 原生右键菜单。                                                       | 如果目标是系统原生菜单，当前可保留；如果目标是 demo 视觉菜单，需要自绘托盘菜单窗口。 |

## 已基本对齐的部分

- 主面板宽度 460px、圆角卡片、浅阴影、蓝紫主色。
- 标题栏：logo、`OmniUsage`、刷新、设置。
- Provider tab：总览 + 各服务横向滚动。
- 总览页 provider 聚合。
- 单 provider tab 账号列表。
- 多账号厂商可展示概览 / 账号明细。
- 卡片状态：loading skeleton、网络错误、凭证失效、关闭、暂无账号、接近限制色彩。
- 卡片操作：刷新、更多菜单、关闭、编辑入口。
- 拖拽排序：provider 和账号均已有前端交互。
- 动态高度：当前实现已有 mirror + ResizeObserver + 主进程 setBounds 机制。
- 主题：浅色、深色、强调色。
- 通知、数据与隐私、关于等设置分区已有基础内容。

## 设计意图约束

从 chats 可归纳出以下约束，对后续实现有约束力：

1. 产品是跨平台托盘小工具，不是宽屏 dashboard。
2. 视觉要简洁、克制、高级、现代，主色蓝，支持暗色。
3. 不突出费用、金额、价格；不要复杂 BI。
4. 主面板保持细长弹窗形态，内容少时缩小，内容多时增长，超过上限才滚动。
5. 多账号默认看厂商概览，需要时展开账号明细。
6. 单账号 Token、模型图例、费用统计都不要放进主面板。
7. 设置必须独立成窗口，不在主面板内部替换。
8. CPA Manager 是数据源概念；CPA 来源账号与直接添加账号必须视觉和操作语义分离。

## 建议对齐顺序

1. 独立 settings window：主进程新增 settings 窗口管理，主面板/托盘设置入口改为打开或聚焦 settings 窗口。
2. 设置页按 demo 扩展导航：账号、数据源、外观、通知、数据与隐私、关于；数据源仅 CPA 场景显示。
3. 补 CPA Manager 数据源列表和详情页。
4. 补添加账号 picker 和各服务表单入口。
5. 重做账号页单/多账号布局，并区分 CPA 来源账号的隐藏/删除语义。
6. 统一 provider 关闭、删除、启用的数据模型，避免主面板本地状态和设置页配置割裂。
7. 微调主面板高度上限到 demo 的 75%，并做实际窗口验收。
8. 最后处理纯视觉细节：设置页间距、badge、菜单宽度、品牌标识、暗色模式边界状态。

## 不纳入本轮差异

- Token 面板关闭：这是用户明确命令，不作为 demo 未对齐问题。
- demo 内旧 `settings.jsx` 等未引用文件：属于 demo handoff 残留，不影响当前实现对齐目标。

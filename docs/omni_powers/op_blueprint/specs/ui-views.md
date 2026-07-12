<!-- omni_powers: blueprint/specs/ui-views -->

# UI 视图（renderer）

`src/renderer/views/`。IPC 见 `ipc.md`；窗口承载见 `window-management.md`；术语见 `domain.md`。

## 三视图

### PopupView（主面板，route=popup）

托盘弹窗主面板，默认视图。组合：

- `ProviderNav` — 顶部 provider 导航 tab（总览 + 各 provider）
- `ProviderOverview` — 概览聚合卡片
- `ProviderAccountList` — 单 provider 下账号列表
- `TokenPanel` — 用量条展示
- `CollapsibleCard` — 可折叠卡片

数据管线（`lib/provider-usage`）：

- `build_provider_usage_groups` — 按 provider 聚合观测
- `visible_providers_from_groups` — 计算可见 provider
- `apply_account_overrides` — 应用账号隐藏/标签/排序
- `PROVIDER_ORDER` — provider 排序

特性：

- `use_popup_height_report` + `useResizeObserver` — 上报内容高度驱动窗口自适应
- `useNowTick` — 周期 tick 刷新相对时间显示
- 用量条样式：`UsageBarStyle`（细线 / 粗胶囊）/ `UsageBarColorScheme`

### SettingsView（设置窗，route=settings）

`SettingsForm` + `VendorCard`（直连 provider 卡，内嵌 `AccountRow`）+ `CpaCard`（CPA 卡，父行自渲染 + `AccountRow mode="cpa-child"`）+ `CpaConnectorSettings`（CPA 数据源详情）+ `LabelMapDialog`（数据标签映射）+ `RenameAccountDialog`（账号备注）+ `ConfirmDelete`（删除确认）+ `AddAccountDialog`（新增账号）。

**账号行布局**（`AccountRow` + `CpaCard`）：

- 身份区（`.ar-id`）：`VendorMark` + 厂商名 + `· 备注`（仅 `displayName`/`account_label` 非空时显示）。备注灰 `--text-3`，长文本截断。
- 状态区（`.ar-status`，固定 `72px`）：状态灯 + 状态文字。直连行始终显示；CPA 父行显示整体连接状态；CPA 子行不渲染。
- 状态映射：`ok` → 绿"正常"；`error` → 红"采集失败"；`auth` → 红"凭证失效"；`disabled`/`!enabled` → 灰"已关闭"。CPA 父行 `partial`/`error` → 红"采集失败"。
- CPA 父行：`CPA · displayName`（无备注时仅 `CPA`），不显示账号/服务商计数。子行去重 `provider:account_id`，保留隐藏开关/改备注/来源已移除清除。
- 术语统一："备注名"/"账号名称"/"别名" → "备注"。底层 `displayName` 字段与 schema 不变。

- `REFRESH_INTERVAL_OPTIONS` + `refresh_seconds_to_label` / `refresh_label_to_seconds` — 刷新间隔选项
- `account_overrides`（add/remove）— 账号隐藏/标签
- `ADD_COMMON_SERVICES` — 添加账号的服务清单
- `redact_config_raw` — config 日志脱敏
- 导航：`settings:navigate(SettingsOpenContext)` 从主面板"编辑账号"跳入定位
- **实时同步**：订阅 `onStateChange` 保持 `pluginInfos` 与 connector snapshot 同步（CPA 连接器状态就绪后子行即时出现）

### TrayMenu（托盘菜单，route=tray）

自定义 frameless 托盘菜单（非系统原生菜单）。`TrayMenuItem`：icon / label_zh / label_en / danger / checked / action。

- `is_paused` — 暂停状态（`tray:pauseState`）
- autostart 状态（`tray:autostartState`）
- `tray:reportMenuSize` 上报菜单尺寸驱动窗口大小
- 版本号从 URL hash `?v=` 解析

## 共性

- 全部 `useTheme()` 适配 dark/light
- 经 `window.usageboard`（preload `UsageboardApi`）调主进程，不直接 Node
- 日志经 `log:renderer` 转发主进程统一 scrubber 脱敏

## 国际化

`language: zh-Hans | en`。label 双语字段 `label` / `label@zh-Hans`。

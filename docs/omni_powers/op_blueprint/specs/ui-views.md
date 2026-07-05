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

`SettingsForm` + `VendorCard`（直连 provider 卡）+ `CpaCard`（CPA 卡）+ `CpaConnectorSettings`（CPA 数据源详情）+ `LabelMapDialog`（账号/provider 改名）+ `ConfirmDelete`（删除确认）。

- `REFRESH_INTERVAL_OPTIONS` + `refresh_seconds_to_label` / `refresh_label_to_seconds` — 刷新间隔选项
- `account_overrides`（add/remove）— 账号隐藏/标签
- `ADD_COMMON_SERVICES` — 添加账号的服务清单（含 minimax/firecrawl，commit `b5ff7b9`）
- `redact_config_raw` — config 日志脱敏
- 导航：`settings:navigate(SettingsOpenContext)` 从主面板"编辑账号"跳入定位

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

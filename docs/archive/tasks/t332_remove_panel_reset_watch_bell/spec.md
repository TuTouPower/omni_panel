# Task spec

## 背景

用量面板（PopupView，托盘弹出面板）的用量条行右侧有一个「即将重置」监控铃铛按钮（`UsageBarRow` 的 `bar-watch`，bell 图标）。该按钮在两处用量条上出现：概览视图（`ProviderOverview`）与账号列表视图（`ProviderAccountList`）。用户确认从用量面板移除该按钮；「即将重置」监控开关入口保留在设置账号对话框（`AccountDialog` → `SettingsForm`），监控配置 `upcomingResetWatched` 及其读写逻辑不改。

## 契约区

### 范围

- PopupView 用量面板两处用量条（概览 `ProviderOverview`、账号列表 `ProviderAccountList`）的铃铛按钮不再渲染。
- 移除该按钮的整条实现链：`UsageBarRow` 的 bell 按钮与 `watched` / `on_toggle_watched` props；`UsageBarList`、`AccountUsageRow`、`ProviderCard`、`provider_card_content`、`ProviderOverview`、`ProviderAccountList`、`ProviderAccountRow` 的透传 props；PopupView 的 `handle_toggle_watched` 与 `use_watched_metric_toggler` 引用。
- 若 `use_watched_metric_toggler` 不再被任何代码引用，删除该 hook 及其测试；`account-overrides` 的 `add_watched_metric` / `remove_watched_metric` 因设置侧（SettingsView / CpaLabelMapDialog）仍用而保留。
- 同步更新受影响测试（`usage_rows` / `popup_view_upcoming` / `use_watched_metric_toggler` 等），移除对已删按钮的断言。

### 非范围

- 不改 `SettingsForm` / `LabelMapDialog` 里的铃铛按钮（t333 处理斜杠）。
- 不改 `upcomingResetWatched` 配置结构、`account-overrides` 逻辑与设置侧读写（t333 仍依赖）。
- 不改 `UpcomingResetCard` / `UpcomingResetRow`（「即将重置」卡片本体）。
- 不改趋势窗口、卡片折叠等其它用量面板 UI。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

<!-- /规范 -->

<!-- 规范（门禁必留，不得删除） -->

每条 AC 条目带稳定编号 `AC-NNN`（三位十进制、task 内从 001 顺序编号、唯一、删除不复用）；收尾时 `handoff.json` 的 `ac_evidence` 须精确覆盖本区全部编号。编号约定见 `docs/blueprint/conventions.md`。

<!-- /规范 -->

- [ ] AC-001：用量面板概览视图（`ProviderOverview`）的用量条行不再渲染铃铛监控按钮（`bar-watch` testid 不存在）。
- [ ] AC-002：用量面板账号列表视图（`ProviderAccountList`）的用量条行不再渲染铃铛监控按钮（`bar-watch` testid 不存在）。
- [ ] AC-003：设置账号对话框（`AccountDialog` → `SettingsForm`）的铃铛按钮仍存在且可切换监控状态，监控功能不回归。
- [ ] AC-004：删除相关实现后无残留死引用，`pnpm` 构建与既有测试通过（`use_watched_metric_toggler` 及其测试若已无引用则一并移除）。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（组件层 testid 断言 + 构建/类型检查）。

## 上下文区

- 来源：用户需求（2026-08-12；用量面板移除「即将重置」监控铃铛，入口保留设置侧；用户已确认两处用量条都删、监控功能保留设置入口）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 无。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 更新 `usage_rows.test.tsx`：移除 `bar-watch` 渲染断言；新增「未传 `on_toggle_watched` 时不渲染铃铛按钮」可并入现有点击测试改造。
- 更新 `popup_view_upcoming.test.tsx` / 其它 PopupView 相关测试：移除对用量面板铃铛按钮的断言。
- `use_watched_metric_toggler` 若删除则同步删除 `use_watched_metric_toggler.test.ts`。
- 断言目标：`data-testid="bar-watch"` 在 PopupView 渲染树中不存在；`SettingsForm` 的 `aria-label="监控该数据标签的即将重置"` 按钮仍存在。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- 无。

### 风险与回退

- 风险：删除透传链时漏清引用导致类型/构建失败；误删 `account-overrides`（设置侧仍用）。
- 回退：单文件级 git 回退；本 task 不触碰 `upcomingResetWatched` 配置与 `account-overrides`，监控配置数据不受影响。

### 依赖与约束

- 与 t333 共享 `upcomingResetWatched` 配置与 `account-overrides`；本 task 不得改动该逻辑，避免与 t333 冲突。
- 仅影响渲染层与透传链，不涉及数据层。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：无（纯 UI 移除，不改变架构契约）。

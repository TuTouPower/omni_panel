# Task spec

## 背景

原「数据标签映射」功能仅支持重命名展示名称，无法屏蔽用户不需要关注的数据标签；同时文案「数据标签映射」偏技术实现，改为「数据标签设置」更符合用户心智。需要将相关界面文案统一更新为「数据标签设置」，并在设置中为每个数据标签增加显隐开关，支持用户关闭特定标签，关闭后在用量面板中隐藏该指标展示。

## 契约区

### 范围

- 文案统一：将设置页、表单、弹窗中涉及「数据标签映射」的界面文案、对话框标题、按钮 title 及 aria-label 统一更新为「数据标签设置」。
- 配置支持：AppConfiguration 及 Zod schema 扩展数据标签隐藏配置（`providerHiddenLabels` 与 `accountHiddenLabels`），记录被禁用的 `raw_label` 列表，纳入 preload 白名单与配置读写流程。
- 设置界面交互：
    - 直连账号设置（`SettingsForm`）与 CPA 厂商标签设置弹窗（`LabelMapDialog`）的标签列表行右侧新增显隐切换按钮（眼睛图标 `eye` / `eye_off`）。
    - 用户点击可切换显隐状态，并随配置保存持久化。
- 用量展示过滤：在 `provider-usage.ts` 派生用量数据时，过滤掉处于隐藏状态的数据标签（period），使其在用量卡片柱状图、趋势折线图以及即将重置监控中均不展示。
- 测试用例适配与补全：更新因文案调整影响的既有单测与 E2E 定位器，新增显隐配置读写、过滤逻辑及组件交互的自动化测试。

### 非范围

- 不修改底层连接器（connector）和采集脚本采集 MetricRecord 的原始数据输出。
- 不修改用量面板排序拖拽机制。
- 不引入独立的标签管理新视图页面（复用现有设置表单和弹窗）。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：`SettingsForm`、`LabelMapDialog`、`CpaConnectorSettings` 及通用设置中原「数据标签映射」相关文案与按钮提示统一更新为「数据标签设置」。
- [ ] AC-002：配置层支持保存与读取 `providerHiddenLabels`（按 provider）与 `accountHiddenLabels`（按 instanceId）中被隐藏的 `raw_label` 集合，且在 preload 白名单中放行。
- [ ] AC-003：在 `SettingsForm` 与 `LabelMapDialog` 的数据标签列表中，每个标签行右侧渲染显隐切换按钮，可直观区分显示/隐藏状态，点击切换并成功持久化。
- [ ] AC-004：被标记为隐藏的数据标签在主用量面板（`UsageBarRow`）、趋势折线图（`TrendSparkline`）及即将重置卡片（`UpcomingResetCard`）中不再展示。
- [ ] AC-005：既有单元测试与 E2E 测试中因文案变更导致的定位器全部适配通过，无测试回退。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：无

### 有意不测

- 无

### 测试策略

- 单元测试：`config-schema.test.ts` 覆盖新字段解析与 strip，`provider-usage.test.ts` 覆盖隐藏标签过滤逻辑，`settings_form.test.tsx` 与 `cpa_label_map_dialog.test.tsx` 覆盖显隐按钮交互。
- 自动化端到端测试：运行既有 `settings_view.spec.ts` 与 `cpa_label_map_watch.spec.ts` 验证文案定位与配置链路。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：批量更新既有测试中的文案定位器可能遗漏边缘用例导致 CI 报错。
- 回退：通过 `git diff` 检查全仓定位器变更，回退并精准校对定位器。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- `docs/specs/ui-views-web.md`：更新数据标签设置文案及显隐过滤规则说明。
- `docs/specs/config-store.md`：追加 `providerHiddenLabels` 与 `accountHiddenLabels` 配置字段说明。

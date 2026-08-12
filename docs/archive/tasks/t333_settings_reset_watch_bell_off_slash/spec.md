# Task spec

## 背景

设置侧「即将重置」监控铃铛按钮（bell 图标）出现在两处：设置账号对话框（`AccountDialog` → `SettingsForm`，数据标签映射行右侧）与设置页标签映射对话框（`CpaLabelMapDialog` → `LabelMapDialog`）。关闭（未监控）状态下当前仅以半透明区分（`opacity` 0.35 / 0.5）。用户要求未监控状态在铃铛上叠加斜线表示停用（类似静音/禁用符号）；用户已确认两处都改、视觉采用「铃铛叠斜线」。

## 契约区

### 范围

- `SettingsForm` 的铃铛按钮：未监控状态在铃铛上叠加一条斜线，已监控状态保持正常铃铛。
- `LabelMapDialog` 的铃铛按钮：同款处理。
- 斜杠显隐与监控状态联动，切换时即时更新。
- 更新受影响测试（`settings_view_watched` / `label_map_dialog` / `settings_view_cpa` / `cpa_label_map_watch` / `settings_provider_accounts`）。

### 非范围

- 不改用量面板（PopupView）用量条铃铛按钮（t332 删除）。
- 不改监控判定与切换逻辑（`watched` 计算、toggle 行为、`upcomingResetWatched` 配置读写）。
- 不改已监控（on）状态的铃铛视觉。

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

- [ ] AC-001：设置账号对话框（`SettingsForm`）铃铛按钮在未监控状态叠加斜线，已监控状态无斜线。
- [ ] AC-002：设置页标签映射对话框（`LabelMapDialog`）铃铛按钮在未监控状态叠加斜线，已监控状态无斜线。
- [ ] AC-003：两处按钮点击切换监控状态的行为不回归（`watched` 可正确切换并持久化到 `upcomingResetWatched`）。
- [ ] AC-004：斜杠显隐随监控状态即时更新，无需刷新或二次交互。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

<!-- /规范 -->

- 全部 AC 可自动测试（组件层状态断言 + e2e）。斜杠的精确像素视觉不测，只测状态驱动的斜杠存在性标记。

## 上下文区

- 来源：用户需求（2026-08-12；设置侧两处铃铛按钮关闭状态加斜杠，用户确认两处都改、视觉为铃铛叠斜线）。

### 有意不测

<!-- 规范（门禁必留，不得删除） -->

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

<!-- /规范 -->

- 斜杠叠加的精确视觉（像素级）与动画细节：不测，属视觉还原范畴；只测状态驱动的斜杠存在性标记（如 `data-` 属性或 class）。

### 测试策略

<!-- 规范（门禁必留，不得删除） -->

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

<!-- /规范 -->

- 更新 `settings_view_watched.test.tsx` / `label_map_dialog.test.tsx` / `settings_view_cpa.test.tsx`：断言未监控状态按钮带斜杠标记、已监控状态不带。
- 更新 `cpa_label_map_watch.spec.ts` / `settings_provider_accounts.spec.ts`（e2e）：斜杠标记随切换更新。
- 断言目标：按钮的斜杠标记（实现时定 `data-` 属性或 class），不依赖截图。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

<!-- /规范 -->

- `Icon` 组件 bell 图标渲染机制：已由 d037 验证——lucide-react 提供 `BellOff`（`bell-off.mjs`），未监控用 `Icon name="bell_off"` 得铃铛带斜线，无需自绘叠加；Icon 已加 `bell_off` 映射与 `data-slash` 透传（结论 + 验证方式见 d037）。

### 风险与回退

- 风险：斜杠叠加方式受 `Icon` 渲染机制限制，叠加方案需先实验；两处按钮样式实现不一致。
- 回退：单文件级 git 回退；本 task 不触碰监控配置与 toggle 逻辑，数据无风险。

### 依赖与约束

- 与 t332 共享 `upcomingResetWatched` 配置与 `account-overrides`；本 task 不得改动该逻辑，避免与 t332 冲突。
- 两处按钮样式保持一致，同用一套叠加实现。

### Finalization 时更新的 blueprint

- `docs/blueprint/architecture.md`：无（纯 UI 样式调整，不改变架构契约）。

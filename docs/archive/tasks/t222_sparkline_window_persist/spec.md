# Task spec

契约区执行期原则上不再改动；确需调整须经用户确认（渲染 review prompt 时脚本会附契约区相对 diff_anchor 的 drift diff 供 reviewer 核对）。上下文区执行期可补。

## 背景

p046（t208 SPIKE 结论）：sparkline 窗口选择器（1/7/30 天）在 `ProviderAccountRow.tsx:81` 用 session 内 `useState(7)`，重启回默认 7 天。config 层有 per-view 偏好字段先例（`collapsedAccounts` / `expandedProviders` 等），可加字段持久化用户选择。属功能增强，非 bug。

## 契约区

reviewer 判 AC 时只看本区。

### 范围

- `src/shared/types/config.ts`：`AppConfiguration` 加 sparkline 窗口偏好字段（如 `sparklineWindowDays?: number`）。
- `src/renderer/components/ProviderAccountRow.tsx`：`trend_days` 初始值从 config 读、变更后写回 config（走 PopupView 现有 config 持久化链路 `patchConfig`）。
- 相关单测：偏好读写、默认回退、持久化往返。

### 非范围

- sparkline 数据查询 / 缓存逻辑（t208）。
- token-stats 面板自己的窗口选择（`TokenStatsView` 的 `preset` 已用 localStorage 持久化，不动）。
- 其它 per-view 偏好。

### 验收标准

只写用户或调用方可观察行为，每条可独立验证。普通版本号、底层库和目录结构不作为验收标准；需要长期约束后续工作的技术选择写入 `docs/blueprint/decisions.md`。

需真实部署或人工环境才能验证的条目加 `[deploy]` 前缀，标明 agent 无法自证。

- [ ] 用户把某账号 sparkline 窗口切到 1 天，重启应用后仍是 1 天（不再回默认 7 天）。
- [ ] 未设置偏好时行为不变（默认 7 天）。
- [ ] 偏好改动经 config 持久化链路保存，其它面板读取 config 不受影响。
- [ ] 多账号共享同一窗口偏好（全局一个值，非 per-account）。

### 可测试性声明

逐条说明哪些 AC 不可自动测试及原因；全部可测则写「全部 AC 可自动测试」。

- 全部 AC 可自动测试（组件测试 mock config get/save + 重启模拟）。

## 上下文区

reviewer 判测试覆盖时核对本区；实施期可补。

### 有意不测

已判定不写测试的分支与原因。reviewer 不得据此出 blocking finding。无则写「无」。

- 无。

### 测试策略

mock 边界、fixture 来源、断言目标。无特殊约定写「按项目默认」。

- mock `usageboard.config.get/save`：初始 config 含 `sparklineWindowDays: 1` → 渲染后窗口按钮激活 1 天；点击 30 天 → `config.save` 收到 `sparklineWindowDays: 30`。
- 默认：config 无字段 → 7 天。

### 未知契约清单

尚未核实的外部 endpoint、API 形态、数据结构、第三方行为须分类标记；核实后删除标记，改为结论并注明验证方式。无则写「无」。

`UNVERIFIED-BLOCKING`：只有用户或外部环境能核实；核实前 `start` 失败。

`UNVERIFIED-SPIKE`：agent 可在执行期 Step 1 实验核实；未核实前不得进入实现。

裸 `UNVERIFIED` 属歧义格式，门禁失败。

- 无。

### 风险与回退

- 风险：`patchConfig` 链路在 PopupView 由 usePopupUiConfig 管理，ProviderAccountRow 是深子树，需要把 setter 从 usePopupUiConfig 传下来或经 context。
- 回退：ProviderAccountRow 直接用 `usageboard.config.get/save` 自管（绕过 patchConfig），但需防广播回显循环（参照 t153 collapse 的 prev_ref 模式）。
- 风险（执行期核实，t222_gen_f001/f003）：apply_config 读偏好须用函数式 setter 且依赖数组不含 state——否则窗口切换触发 config.get 回读旧值闪回并错误持久化（f001，已修）；schema 允许 1-365 任意整数而 UI 仅 1/7/30 三档，越档值（如 100）三按钮均无 active 态——接受现状，sparkline getBulk 用任意 days 仍正确工作，UI 显示边界情况不影响功能（f003，记录不修）。

### 依赖与约束

- 依赖 t208（sparkline 窗口选择器）。
- config 字段新增需核对 `DEFAULT_CONFIGURATION` 与 config-store schema。

### Finalization 时更新的 blueprint

- `docs/specs/ai-cli-token-stats-ui.md` 或 popup spec：sparkline 窗口偏好持久化注明。

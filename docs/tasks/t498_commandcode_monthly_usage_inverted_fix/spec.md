# Task spec

## 背景

在当前版本中，用量面板展示 Command Code 账号时，「月额度」进度条与数值显示为已使用 ~80%（如 56.16/70），而实际 Command Code 官方 CLI 与 Web 端明确显示为「Monthly Limit 20%」（重置日期 10/13）。根因是 Command Code 上游 API `/alpha/billing/credits` 的 `credits.monthlyCredits` 字段实际为当月「剩余额度」（balance），而连接器将其直接赋给 OmniPanel 的 `used` 字段（已消耗量），导致百分比计算完全反向；同时阈值判定反向误报，且因采用 `display_style: "ratio"` 导致前端隐藏了重置日期。本 task 修复此语义偏差、状态判断与展示风格。

## 契约区

### 范围

- 修正 `connectors/commandcode/connector.ts` 中月度额度观察量的生成逻辑：
    - 已消耗额度计算：当套餐上限 `monthly_cap` 存在时，`used = Math.max(0, monthly_cap - monthly_remaining)`，`limit = monthly_cap`。
    - 展示模式与重置时间对齐：`display_style` 改为 `"percent"`，保留 `reset_at = current_period_end`，与 5 小时、周用量保持一致。
    - 状态判定修正：基于实际消耗比例或 `belowThreshold` 正确判定 `normal`、`warning` 与 `critical`。
    - 容错降级：当 `monthly_cap` 未知时降级为 ratio 显示（`used = monthly_remaining`, `limit = null`, `display_style = "ratio"`）。
- 更新与补齐单元测试 `tests/unit/connector/commandcode.test.ts`：
    - 修正原本断言错误行为的假绿测试，验证实际消耗量（`monthly_cap - monthlyCredits`）、百分比风格与重置时间输出。
    - 增加高余额（低消耗）、低余额（高消耗/超阈值）及未知套餐降级场景的测试用例。

### 非范围

- 不修改 5 小时与周窗口（`fiveHour`、`weekly`）的正常解析逻辑。
- 不修改 Token 统计（`commandcode-reader.ts`）与会话历史提取逻辑。
- 不修改前端通用的 `UsageBarRow` 组件逻辑。

### 验收标准

<!-- 规范（门禁必留，不得删除） -->

只写可观察、可独立验证的行为；每条使用稳定且不复用的 `AC-NNN`。需真实部署或人工环境验证时在编号前加 `[deploy]`。技术选型不作为行为 AC。

<!-- /规范 -->

- [ ] AC-001：当 API 返回月度剩余额度与已知套餐上限时，`commandcode` 连接器产出的 `commandcode:monthly` 观察量中 `used` 为实际已消耗额度（即 `monthly_cap - monthly_remaining`，且不低于 0），`limit` 为套餐月度额度上限。
- [ ] AC-002：`commandcode:monthly` 观察量的 `display_style` 为 `"percent"`，且附带周期重置时间戳 `reset_at`，与 5 小时和周窗口保持一致，使得前端能正常渲染已用百分比与重置日期。
- [ ] AC-003：`commandcode:monthly` 状态根据实际已消耗量正确映射（低消耗为 `normal`，消耗达 75% 预警阈值为 `warning`，达 90% 严重阈值为 `critical`；`belowThreshold` 为真时至少为 `warning`）。
- [ ] AC-004：当套餐上限未知（`monthly_cap` 为 null）时，连接器安全降级产出原始剩余额度（`used` 为剩余额度，`limit` 为 null，`display_style` 为 `"ratio"`），不发生异常崩溃。

### 可测试性声明

<!-- 规范（门禁必留，不得删除） -->

逐条说明不可自动测试的 AC 及替代验证；全部可测则写“全部 AC 可自动测试”。

<!-- /规范 -->

全部 AC 可自动测试。

## 上下文区

- 来源：p246（2026-09-17 核实，通过上游接口实测与官方 CLI 源码比对确定 `monthlyCredits` 为 balance）

### 有意不测

无

### 测试策略

- 在 `tests/unit/connector/commandcode.test.ts` 中模拟不同套餐（如 `individual-goat`、`individual-pro`、未知套餐）及不同消耗水位（正常用量、临界预警、告急），验证产出的 `used`、`limit`、`display_style`、`reset_at` 及 `status`。

### 未知契约清单

<!-- 规范（门禁必留，不得删除） -->

未核实的外部契约标为 `UNVERIFIED-BLOCKING` 或 `UNVERIFIED-SPIKE`；核实后改写为结论和验证方式。无则写“无”。

<!-- /规范 -->

无

### 风险与回退

- 风险：若用户使用了官方新推出的未知套餐，由于未在 `PLAN_MONTHLY_CAP` 中注册，将触发降级策略。
- 回退：降级策略完整保留原始 `monthlyCredits` 数值并以无上限 ratio 格式安全显示。

### 依赖与约束

- 无

### Finalization 时更新的 blueprint

- 无
